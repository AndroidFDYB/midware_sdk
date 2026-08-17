/**
 * 数据同步模块导出
 *
 * 提供业务数据等待唤醒中间件的完整 API：
 * - DataSyncManager：多通道数据同步管理器
 * - Axios 拦截器：阻塞请求等待数据就绪并自动注入
 * - 装饰器：@waitUserInfoSync / @waitLoanInfoSync / @waitVipInfoSync
 */

// 类型导出
export type {
  InjectTo,
  InjectFunction,
  DataChannelConfig,
  DataSyncManagerConfig,
  InterceptorConfig,
  ChannelState,
} from './types';

// 通道配置由 proto codegen 自动生成
export {
  STANDARD_CHANNELS,
  STANDARD_CHANNEL_CONFIGS,
} from './generated/config.gen';

// 管理器导出
export {
  DataSyncManager,
  getDataSyncManager,
  resetDataSyncManager,
} from './manager';

// 拦截器导出
export {
  createDataSyncInterceptor,
  setupDataSyncInterceptor,
  injectDataToConfig,
  matchUrlPattern,
  pushDecoratorContext,
  popDecoratorContext,
  getCurrentDecoratorChannels,
} from './interceptor';

// 装饰器核心逻辑
export {
  waitDataSync,
  createWaitDecorator,
  getMethodWaitChannels,
} from './decorators';

// 标准装饰器由 proto codegen 自动生成
export {
  waitUserInfoSync,
  waitLoanInfoSync,
  waitVipInfoSync,
} from './generated/decorators.gen';
