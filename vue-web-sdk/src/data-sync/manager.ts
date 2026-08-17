/**
 * DataSyncManager - 业务数据等待唤醒管理器
 *
 * 管理多个数据通道（userInfo / loanInfo / vipInfo / 自定义），每个通道独立维护：
 * - 等待队列：waitForData() 返回的 Promise，在 pushData() 到达后被 resolve
 * - 数据缓存：pushData() 推入的数据，供后续 getData() 获取
 * - 超时控制：每个 waitForData() 可设置独立超时，超时后 reject
 *
 * 数据流：
 *   Native 通过 JSBridge 推送数据 → pushData(channelName, data) → 唤醒等待队列
 *   前端调用 waitForData(channelName) → 返回 Promise，阻塞直到数据到达或超时
 */

import type { DataChannelConfig, DataSyncManagerConfig, ChannelState } from './types';
import { STANDARD_CHANNEL_CONFIGS } from './generated/config.gen';

/** 等待队列项 */
interface Waiter {
  resolve: (data: any) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout> | null;
}

/** 单个数据通道 */
class DataChannel {
  readonly config: DataChannelConfig;
  private state: ChannelState = { data: null, ready: false, arrivedAt: null };
  private waiters: Waiter[] = [];
  private managerConfig: DataSyncManagerConfig;

  constructor(config: DataChannelConfig, managerConfig: DataSyncManagerConfig) {
    this.config = config;
    this.managerConfig = managerConfig;
  }

  /** 获取当前数据 */
  getData(): any {
    return this.state.data;
  }

  /** 数据是否已就绪 */
  isReady(): boolean {
    return this.state.ready;
  }

  /**
   * 等待数据到达
   * 如果数据已缓存，立即 resolve
   * 否则加入等待队列，在 pushData 到达或超时后 resolve/reject
   */
  waitForData(timeout?: number): Promise<any> {
    // 数据已就绪，立即返回
    if (this.state.ready) {
      return Promise.resolve(this.state.data);
    }

    const waitTimeout = timeout ?? this.config.timeout ?? this.managerConfig.defaultTimeout ?? 10000;

    return new Promise<any>((resolve, reject) => {
      const waiter: Waiter = {
        resolve,
        reject,
        timer: null,
      };

      // 设置超时
      if (waitTimeout > 0) {
        waiter.timer = setTimeout(() => {
          const idx = this.waiters.indexOf(waiter);
          if (idx >= 0) {
            this.waiters.splice(idx, 1);
          }
          reject(new Error(`[DataSync] Channel "${this.config.name}" timed out after ${waitTimeout}ms`));
        }, waitTimeout);
      }

      this.waiters.push(waiter);
      this.debug(`Waiting for data on channel "${this.config.name}" (timeout: ${waitTimeout}ms, ${this.waiters.length} waiters)`);
    });
  }

  /**
   * 推入数据，唤醒所有等待者
   * 由 Native 通过 JSBridge 调用后触发
   */
  pushData(data: any): void {
    this.state = {
      data,
      ready: true,
      arrivedAt: Date.now(),
    };

    this.debug(`Data arrived on channel "${this.config.name}", waking up ${this.waiters.length} waiters`);

    // 唤醒所有等待者
    const toNotify = this.waiters.splice(0);
    for (const waiter of toNotify) {
      if (waiter.timer) {
        clearTimeout(waiter.timer);
      }
      waiter.resolve(data);
    }
  }

  /** 清除数据（用于重新同步场景） */
  clearData(): void {
    this.state = { data: null, ready: false, arrivedAt: null };
    this.debug(`Data cleared on channel "${this.config.name}"`);
  }

  /** 获取等待者数量 */
  getWaiterCount(): number {
    return this.waiters.length;
  }

  private debug(message: string): void {
    if (this.managerConfig.debug) {
      console.log(`[DataSync:${this.managerConfig.logTag ?? 'MPBridge'}] ${message}`);
    }
  }
}

/**
 * DataSyncManager - 数据同步管理器
 *
 * 管理多个数据通道，提供统一的注册、推送、等待接口。
 *
 * 使用方式：
 * ```typescript
 * const manager = getDataSyncManager();
 *
 * // 注册自定义通道
 * manager.registerChannel({
 *   name: 'orderInfo',
 *   nativeMethod: 'syncOrderInfo',
 *   injectTo: 'body',
 * });
 *
 * // 等待数据
 * const userInfo = await manager.waitForData('userInfo');
 *
 * // 推送数据（由 Native → JSBridge Handler 调用）
 * manager.pushData('userInfo', { uid: '123', ticket: 'abc' });
 * ```
 */
export class DataSyncManager {
  private channels: Map<string, DataChannel> = new Map();
  private config: DataSyncManagerConfig;

  constructor(config: DataSyncManagerConfig = {}) {
    this.config = {
      defaultTimeout: 10000,
      debug: false,
      logTag: 'MPBridge',
      ...config,
    };

    // 自动注册标准通道
    for (const channelConfig of STANDARD_CHANNEL_CONFIGS) {
      this.registerChannel(channelConfig);
    }
  }

  /**
   * 注册数据通道
   * 如果通道已存在，将更新其配置
   */
  registerChannel(config: DataChannelConfig): void {
    if (this.channels.has(config.name)) {
      this.debug(`Channel "${config.name}" already registered, updating config`);
    }
    this.channels.set(config.name, new DataChannel(config, this.config));
    this.debug(`Registered channel "${config.name}" (nativeMethod: ${config.nativeMethod}, injectTo: ${config.injectTo ?? 'body'})`);
  }

  /** 获取通道配置 */
  getChannelConfig(name: string): DataChannelConfig | undefined {
    return this.channels.get(name)?.config;
  }

  /** 获取所有已注册的通道配置 */
  getAllChannelConfigs(): DataChannelConfig[] {
    return Array.from(this.channels.values()).map(ch => ch.config);
  }

  /**
   * 推送数据到指定通道
   * 通常由 Native → JSBridge Handler 调用
   */
  pushData(channelName: string, data: any): void {
    const channel = this.channels.get(channelName);
    if (!channel) {
      console.warn(`[DataSync] Channel "${channelName}" not registered. Call registerChannel() first.`);
      return;
    }
    channel.pushData(data);
  }

  /**
   * 等待指定通道的数据
   * 如果数据已到达，立即返回
   * 否则阻塞直到数据到达或超时
   */
  waitForData(channelName: string, timeout?: number): Promise<any> {
    const channel = this.channels.get(channelName);
    if (!channel) {
      return Promise.reject(new Error(`[DataSync] Channel "${channelName}" not registered`));
    }
    return channel.waitForData(timeout);
  }

  /** 获取指定通道的当前数据 */
  getData(channelName: string): any {
    const channel = this.channels.get(channelName);
    return channel?.getData() ?? null;
  }

  /** 检查指定通道的数据是否已就绪 */
  isReady(channelName: string): boolean {
    const channel = this.channels.get(channelName);
    return channel?.isReady() ?? false;
  }

  /** 清除指定通道的数据（用于重新同步） */
  clearData(channelName: string): void {
    const channel = this.channels.get(channelName);
    channel?.clearData();
  }

  /** 清除所有通道数据 */
  clearAllData(): void {
    this.channels.forEach(channel => channel.clearData());
  }

  /**
   * 批量等待多个通道数据
   * 所有通道数据就绪后返回
   */
  async waitForAll(channelNames: string[], timeout?: number): Promise<Record<string, any>> {
    const entries = await Promise.all(
      channelNames.map(async (name) => {
        const data = await this.waitForData(name, timeout);
        return [name, data] as [string, any];
      })
    );
    return Object.fromEntries(entries);
  }

  /** 获取指定通道的等待者数量 */
  getWaiterCount(channelName: string): number {
    const channel = this.channels.get(channelName);
    return channel?.getWaiterCount() ?? 0;
  }

  private debug(message: string): void {
    if (this.config.debug) {
      console.log(`[DataSync:${this.config.logTag}] ${message}`);
    }
  }
}

// ========================
// 单例管理
// ========================

let instance: DataSyncManager | null = null;

/** 获取 DataSyncManager 单例 */
export function getDataSyncManager(config?: DataSyncManagerConfig): DataSyncManager {
  if (!instance) {
    instance = new DataSyncManager(config);
  } else if (config) {
    // 更新配置（不影响已注册的通道）
    Object.assign(instance['config'], config);
  }
  return instance;
}

/** 重置实例（用于测试） */
export function resetDataSyncManager(): void {
  instance = null;
}
