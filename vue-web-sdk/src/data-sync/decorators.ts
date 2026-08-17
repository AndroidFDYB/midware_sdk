/**
 * 数据同步装饰器
 *
 * 方法级装饰器，标记 API 方法所需的业务数据通道。
 * 装饰器在方法执行前等待数据就绪，并设置上下文供 Axios 拦截器读取。
 *
 * 工作流程：
 * 1. 装饰器包装原始方法
 * 2. 调用时先等待所需通道数据到达（waitForData）
 * 3. 数据就绪后，push 通道列表到装饰器上下文栈
 * 4. 调用原始方法（内部发起 axios 请求，拦截器从栈顶读取通道并注入数据）
 * 5. 方法执行完毕后 pop 上下文栈
 *
 * 作用域说明：
 * 装饰器上下文覆盖「方法执行期间（含 await 链）发起的请求」。
 * 若请求在 setTimeout、事件回调等脱离当前调用栈的异步回调中发起，
 * 装饰器上下文可能已被 pop，此时需使用路由模式（InterceptorConfig.routes）。
 *
 * 使用方式：
 * ```typescript
 * import axios from 'axios';
 * import { waitUserInfoSync, waitLoanInfoSync, setupDataSyncInterceptor } from '@mp-sdk/bridge';
 *
 * // 安装拦截器（一次性）
 * setupDataSyncInterceptor(axios, { channels: { ... } });
 *
 * class LoanApi {
 *   @waitUserInfoSync
 *   @waitLoanInfoSync
 *   async getLoanList() {
 *     return axios.get('/api/loan/list')
 *   }
 * }
 * ```
 *
 * 注意：需要 tsconfig 中启用 `experimentalDecorators: true`
 */

import type { DataChannelConfig } from './types';
import { getDataSyncManager } from './manager';
import { pushDecoratorContext, popDecoratorContext } from './interceptor';

/**
 * 自定义元数据存储（避免依赖 reflect-metadata polyfill）
 * 使用 WeakMap<target, Map<propertyKey, string[]>> 结构
 */
const metadataStore: WeakMap<object, Map<string, string[]>> = new WeakMap();

/**
 * 向方法的元数据中追加通道名
 * 支持多个装饰器叠加使用（如 @waitUserInfoSync + @waitLoanInfoSync）
 */
function appendChannelMetadata(
  target: any,
  propertyKey: string,
  channelName: string
): string[] {
  let targetMap = metadataStore.get(target);
  if (!targetMap) {
    targetMap = new Map();
    metadataStore.set(target, targetMap);
  }
  const existing = targetMap.get(propertyKey) || [];
  if (!existing.includes(channelName)) {
    existing.push(channelName);
  }
  targetMap.set(propertyKey, existing);
  return existing;
}

/** 从元数据存储中获取方法的等待通道列表 */
function getChannelMetadata(target: any, propertyKey: string): string[] {
  const targetMap = metadataStore.get(target);
  return targetMap?.get(propertyKey) || [];
}

/**
 * 通用数据同步装饰器工厂
 *
 * 创建一个方法装饰器，标记该方法需要等待指定通道的数据。
 *
 * @param channelName 数据通道名称（如 'userInfo'、'loanInfo'）
 * @returns 方法装饰器
 *
 * @example
 * ```typescript
 * class OrderApi {
 *   @waitDataSync('orderInfo')
 *   async getOrderDetail(id: string) {
 *     return axios.get(`/api/order/${id}`)
 *   }
 * }
 * ```
 */
export function waitDataSync(channelName: string): MethodDecorator {
  return function (target: any, propertyKey: string | symbol, descriptor: PropertyDescriptor): PropertyDescriptor {
    // 累积通道到元数据
    appendChannelMetadata(target, propertyKey as string, channelName);

    const originalMethod = descriptor.value;

    // 替换为异步包装方法
    descriptor.value = async function (this: any, ...args: any[]): Promise<any> {
      const manager = getDataSyncManager();

      // 从元数据获取该方法所有需要的通道
      const requiredChannels: string[] = getChannelMetadata(target, propertyKey as string);

      // 等待所有通道数据就绪（已就绪的会立即返回）
      for (const channel of requiredChannels) {
        try {
          await manager.waitForData(channel);
        } catch (error) {
          // 单个通道超时不阻塞整体执行，拦截器会处理缺失数据
          console.warn(
            `[DataSync] Decorator: channel "${channel}" wait failed:`,
            (error as Error)?.message
          );
        }
      }

      // 设置装饰器上下文，供 Axios 拦截器读取
      pushDecoratorContext(requiredChannels);
      try {
        return await originalMethod.apply(this, args);
      } finally {
        popDecoratorContext();
      }
    };

    // 保留原始方法名（便于调试）
    Object.defineProperty(descriptor.value, 'name', {
      value: originalMethod.name,
      writable: false,
    });

    return descriptor;
  };
}

// 注：waitUserInfoSync / waitLoanInfoSync / waitVipInfoSync 等内置装饰器
// 由 proto codegen 自动生成。参见 generated/decorators.gen.ts

// ========================
// 装饰器工具函数
// ========================

/**
 * 获取方法上标记的等待通道列表
 * 可用于在运行时检查方法所需的通道
 */
export function getMethodWaitChannels(target: any, propertyKey: string): string[] {
  return getChannelMetadata(target, propertyKey);
}

/**
 * 批量注册自定义通道并生成对应装饰器
 *
 * @param channelConfig 通道配置
 * @returns 对应的装饰器函数
 *
 * @example
 * ```typescript
 * const waitOrderInfoSync = createWaitDecorator({
 *   name: 'orderInfo',
 *   nativeMethod: 'syncOrderInfo',
 *   injectTo: 'body',
 * });
 *
 * class OrderApi {
 *   @waitOrderInfoSync
 *   async getOrder() { ... }
 * }
 * ```
 */
export function createWaitDecorator(channelConfig: DataChannelConfig): MethodDecorator {
  // 注册通道到管理器
  getDataSyncManager().registerChannel(channelConfig);
  // 返回装饰器
  return waitDataSync(channelConfig.name);
}
