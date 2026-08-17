/**
 * Axios 数据同步拦截器
 *
 * 在 Axios 请求拦截器中实现「等待唤醒」机制：
 * 1. 检测请求所需的数据通道（来自装饰器上下文或路由匹配）
 * 2. 阻塞请求，等待数据到达或超时
 * 3. 将数据注入请求配置（headers / params / body）
 * 4. 放行请求
 *
 * 两种触发模式：
 * - 装饰器模式：@waitUserInfoSync 标记的方法，装饰器预先等待数据并设置上下文
 * - 路由模式：配置 routes 规则，匹配 URL 自动等待对应通道
 *
 * 使用方式：
 * ```typescript
 * import axios from 'axios';
 * import { setupDataSyncInterceptor } from '@mp-sdk/bridge';
 *
 * setupDataSyncInterceptor(axios, {
 *   channels: {
 *     userInfo: {
 *       name: 'userInfo',
 *       nativeMethod: 'syncUserInfo',
 *       injectTo: 'headers',
 *       headerMap: { uid: 'X-Uid', ticket: 'X-Ticket' },
 *     },
 *   },
 *   routes: {
 *     '/api/loan/*': ['userInfo', 'loanInfo'],
 *   },
 * });
 * ```
 */

import type { InterceptorConfig, DataChannelConfig } from './types';
import { getDataSyncManager } from './manager';

// ========================
// 装饰器上下文（模块级栈）
// ========================

/**
 * 装饰器 → 拦截器通信上下文
 *
 * 装饰器在方法调用前 push 通道列表，
 * 拦截器在请求发出时读取栈顶的通道列表，
 * 方法执行完毕后 pop。
 *
 * 由于 JS 单线程特性，push → 原方法同步执行（含 axios 调用）→ pop 之间
 * 不会被其他代码打断，因此栈顶元素即为当前方法所需通道。
 */
const decoratorContextStack: string[][] = [];

/** 装饰器 push 上下文 */
export function pushDecoratorContext(channels: string[]): void {
  decoratorContextStack.push(channels);
}

/** 装饰器 pop 上下文 */
export function popDecoratorContext(): string[] | undefined {
  return decoratorContextStack.pop();
}

/** 拦截器读取当前装饰器上下文（栈顶） */
export function getCurrentDecoratorChannels(): string[] {
  return decoratorContextStack.length > 0
    ? [...decoratorContextStack[decoratorContextStack.length - 1]]
    : [];
}

// ========================
// URL 模式匹配
// ========================

/**
 * 简单的 URL glob 匹配
 * 支持通配符 *（匹配任意非 / 字符序列）和 **（匹配任意路径）
 *
 * 示例：
 *   matchUrlPattern('/api/loan/list', '/api/loan/*') → true
 *   matchUrlPattern('/api/vip/detail', '/api/loan/*') → false
 *   matchUrlPattern('/api/a/b/c', '/api/**') → true
 */
export function matchUrlPattern(url: string, pattern: string): boolean {
  if (!url || !pattern) return false;

  // 将 glob 模式转换为正则
  const regexStr = pattern
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')  // 转义特殊字符
    .replace(/\*\*/g, '###GLOBSTAR###')       // 临时标记 **
    .replace(/\*/g, '[^/]*')                   // * 匹配非 / 的任意字符
    .replace(/###GLOBSTAR###/g, '.*');        // ** 匹配任意字符

  const regex = new RegExp(`^${regexStr}(/.*)?$`);
  return regex.test(url);
}

// ========================
// 数据注入
// ========================

/**
 * 将通道数据注入到 Axios 请求配置中
 *
 * 注入策略（优先级从高到低）：
 * 1. 自定义 inject 函数
 * 2. injectTo === 'headers'：使用 headerMap 映射字段到请求头
 * 3. injectTo === 'params'：合并到 URL 查询参数
 * 4. injectTo === 'body'（默认）：合并到请求体
 */
export function injectDataToConfig(
  axiosConfig: any,
  channelConfig: DataChannelConfig,
  data: any
): void {
  if (data == null) return;

  // 1. 自定义注入函数
  if (typeof channelConfig.inject === 'function') {
    channelConfig.inject(axiosConfig, data);
    return;
  }

  const injectTo = channelConfig.injectTo ?? 'body';

  switch (injectTo) {
    case 'headers': {
      // 确保 headers 对象存在
      if (!axiosConfig.headers) {
        axiosConfig.headers = {};
      }
      const headerMap = channelConfig.headerMap;
      if (headerMap && typeof data === 'object') {
        // 按 headerMap 映射字段
        for (const [dataKey, headerName] of Object.entries(headerMap)) {
          if (data[dataKey] != null) {
            axiosConfig.headers[headerName] = String(data[dataKey]);
          }
        }
      } else if (typeof data === 'object') {
        // 无 headerMap，直接展开
        Object.assign(axiosConfig.headers, data);
      } else {
        // 标量值，使用通道名作为 header 名
        axiosConfig.headers[channelConfig.name] = String(data);
      }
      break;
    }

    case 'params': {
      if (!axiosConfig.params) {
        axiosConfig.params = {};
      }
      if (typeof data === 'object') {
        Object.assign(axiosConfig.params, data);
      } else {
        axiosConfig.params[channelConfig.name] = data;
      }
      break;
    }

    case 'body':
    default: {
      if (typeof data === 'object' && data !== null) {
        if (typeof axiosConfig.data === 'object' && axiosConfig.data !== null) {
          // 合并到已有 body
          Object.assign(axiosConfig.data, data);
        } else if (axiosConfig.data == null) {
          axiosConfig.data = { ...data };
        } else {
          // body 是非对象（如字符串），包装为对象
          axiosConfig.data = { _original: axiosConfig.data, ...data };
        }
      } else {
        axiosConfig.data = data;
      }
      break;
    }
  }
}

// ========================
// 拦截器实现
// ========================

/**
 * 创建数据同步 Axios 请求拦截器
 *
 * @param config 拦截器配置
 * @returns Axios 请求拦截器函数
 */
export function createDataSyncInterceptor(config: InterceptorConfig) {
  const manager = getDataSyncManager();
  const enableDecoratorContext = config.enableDecoratorContext !== false;

  return async function dataSyncInterceptor(axiosConfig: any): Promise<any> {
    // 收集当前请求所需的所有数据通道
    const requiredChannels = new Set<string>();

    // 1. 从装饰器上下文获取
    if (enableDecoratorContext) {
      const decoratorChannels = getCurrentDecoratorChannels();
      for (const ch of decoratorChannels) {
        requiredChannels.add(ch);
      }
    }

    // 2. 从路由匹配获取
    if (config.routes && axiosConfig.url) {
      for (const [pattern, channels] of Object.entries(config.routes)) {
        if (matchUrlPattern(axiosConfig.url, pattern)) {
          for (const ch of channels) {
            requiredChannels.add(ch);
          }
        }
      }
    }

    // 3. 等待并注入每个通道的数据
    for (const channelName of requiredChannels) {
      const channelConfig = config.channels[channelName];
      if (!channelConfig) {
        continue;
      }

      try {
        // waitForData 在数据已就绪时立即返回，否则阻塞等待
        const data = await manager.waitForData(channelName, channelConfig.timeout);
        injectDataToConfig(axiosConfig, channelConfig, data);
      } catch (error) {
        // 超时或通道未注册，记录警告并继续（不阻塞请求）
        console.warn(
          `[DataSync] Failed to get data for channel "${channelName}":`,
          (error as Error)?.message
        );
      }
    }

    return axiosConfig;
  };
}

/**
 * 安装数据同步拦截器到 Axios 实例
 *
 * @param axiosInstance Axios 实例（axios 或 axios.create() 的返回值）
 * @param config 拦截器配置
 * @returns 拦截器 ID（可用于 axios.interceptors.request.eject(id) 移除）
 *
 * @example
 * ```typescript
 * import axios from 'axios';
 * import { setupDataSyncInterceptor } from '@mp-sdk/bridge';
 *
 * const http = axios.create({ baseURL: 'https://api.example.com' });
 *
 * setupDataSyncInterceptor(http, {
 *   channels: {
 *     userInfo: {
 *       name: 'userInfo',
 *       nativeMethod: 'syncUserInfo',
 *       injectTo: 'headers',
 *       headerMap: { uid: 'X-Uid', ticket: 'X-Ticket' },
 *       timeout: 15000,
 *     },
 *     loanInfo: {
 *       name: 'loanInfo',
 *       nativeMethod: 'syncLoanInfo',
 *       injectTo: 'body',
 *     },
 *   },
 *   routes: {
 *     '/api/loan/*': ['userInfo', 'loanInfo'],
 *     '/api/vip/*': ['userInfo', 'vipInfo'],
 *   },
 * });
 * ```
 */
export function setupDataSyncInterceptor(
  axiosInstance: any,
  config: InterceptorConfig
): number {
  const interceptor = createDataSyncInterceptor(config);
  return axiosInstance.interceptors.request.use(interceptor);
}
