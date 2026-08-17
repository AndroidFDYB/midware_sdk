/**
 * 数据同步模块类型定义
 */

/** 数据注入位置 */
export type InjectTo = 'headers' | 'params' | 'body';

/** 自定义注入函数签名 */
export type InjectFunction = (config: any, data: any) => any;

/** 数据通道配置 */
export interface DataChannelConfig {
  /** 通道名称，如 'userInfo'、'loanInfo'、'vipInfo' */
  name: string;
  /** Native 端推送数据时调用的 JSBridge 方法名，如 'syncUserInfo' */
  nativeMethod: string;
  /** 数据注入位置，默认 'body' */
  injectTo?: InjectTo;
  /** 请求头字段映射（当 injectTo 为 'headers' 时使用），如 { uid: 'X-Uid', ticket: 'X-Ticket' } */
  headerMap?: Record<string, string>;
  /** 等待超时时间（毫秒），默认 10000 */
  timeout?: number;
  /** 自定义注入函数（优先于 injectTo） */
  inject?: InjectFunction;
}

/** 数据同步管理器配置 */
export interface DataSyncManagerConfig {
  /** 默认超时时间（毫秒），默认 10000 */
  defaultTimeout?: number;
  /** 是否输出调试日志，默认 false */
  debug?: boolean;
  /** 日志标签 */
  logTag?: string;
}

/** Axios 拦截器配置 */
export interface InterceptorConfig {
  /** 通道配置映射 */
  channels: Record<string, DataChannelConfig>;
  /** 路由匹配规则：URL 模式 → 需要等待的通道名数组 */
  routes?: Record<string, string[]>;
  /** 是否启用装饰器上下文（默认 true） */
  enableDecoratorContext?: boolean;
}

/** 通道数据状态 */
export interface ChannelState {
  /** 当前数据（null 表示尚未到达） */
  data: any;
  /** 数据是否已就绪 */
  ready: boolean;
  /** 数据到达时间戳 */
  arrivedAt: number | null;
}

// 注：STANDARD_CHANNELS 和 STANDARD_CHANNEL_CONFIGS 由 proto codegen 自动生成。
// 参见 generated/config.gen.ts
