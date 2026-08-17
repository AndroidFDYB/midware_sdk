/**
 * @mp-sdk/bridge
 *
 * 跨平台 JSBridge SDK
 * 提供统一的 JS <-> Native 桥接通信能力 + 业务数据等待唤醒中间件
 *
 * 支持平台：Android（JsBridge）、HarmonyOS（javaScriptProxy）、纯 Web
 *
 * 核心功能：
 * 1. JSBridge 双向通信：bridge.call / bridge.callAsync / bridge.register
 * 2. URL 平台检测：getPlatform() / detectPlatformFromUrl()
 * 3. 数据同步中间件：DataSyncManager + Axios 拦截器 + 装饰器
 *
 * 使用示例：
 * ```typescript
 * import { bridge, getPlatform } from '@mp-sdk/bridge'
 *
 * // 平台检测
 * const platform = getPlatform() // 'android' | 'harmony' | 'web'
 *
 * // JSBridge 通信
 * const result = await bridge.callAsync('pay', { amount: 100 })
 *
 * // 数据同步（配合 Axios 拦截器 + 装饰器）
 * import { setupDataSyncInterceptor, waitUserInfoSync } from '@mp-sdk/bridge'
 * import axios from 'axios'
 *
 * setupDataSyncInterceptor(axios, { channels: { ... } })
 *
 * class LoanApi {
 *   @waitUserInfoSync
 *   async getLoanList() { return axios.get('/api/loan/list') }
 * }
 * ```
 */

// JSBridge 核心通信
export { getBridge, resetBridge, setupDataSyncHandlers } from './bridge';
export type { IMPBridge, Platform, SyncHandler, AsyncHandler, IAndroidJsBridge, IHarmonyBridge } from './types';

// 平台检测
export {
  detectPlatformFromUrl,
  detectPlatformFromWindow,
  getPlatform as getPlatformFromUrl,
  isNativeEnvironment,
  getPlatformDebugInfo,
  PLATFORM_QUERY_KEY,
} from './platform';

// 数据同步模块
export type {
  InjectTo,
  InjectFunction,
  DataChannelConfig,
  DataSyncManagerConfig,
  InterceptorConfig,
  ChannelState,
} from './data-sync/types';

// 通道配置和装饰器由 proto codegen 自动生成
export {
  STANDARD_CHANNELS,
  STANDARD_CHANNEL_CONFIGS,
} from './data-sync/generated/config.gen';

export type {
  UserInfo,
  LoanInfo,
  VipInfo,
} from './data-sync/generated/types.gen';

export {
  DataSyncManager,
  getDataSyncManager,
  resetDataSyncManager,
} from './data-sync/manager';

export {
  createDataSyncInterceptor,
  setupDataSyncInterceptor,
  injectDataToConfig,
  matchUrlPattern,
} from './data-sync/interceptor';

export {
  waitDataSync,
  createWaitDecorator,
  getMethodWaitChannels,
} from './data-sync/decorators';

// 标准装饰器由 proto codegen 自动生成
export {
  waitUserInfoSync,
  waitLoanInfoSync,
  waitVipInfoSync,
} from './data-sync/generated/decorators.gen';

// 便捷导出默认实例
import { getBridge } from './bridge';
import { getPlatform } from './platform';
export const bridge = getBridge();
export { getPlatform };
