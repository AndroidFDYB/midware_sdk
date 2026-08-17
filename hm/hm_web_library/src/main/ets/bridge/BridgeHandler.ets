/**
 * BridgeHandler 接口定义
 * 业务方实现此接口来注册自定义 API
 */

/** 同步 Handler：接收参数 JSON 字符串，返回结果 JSON 字符串 */
export type SyncBridgeHandler = (params: string) => string;

/**
 * 异步 Handler：接收参数和完成回调
 * 调用 complete(result) 来返回结果给 JS 端
 */
export type AsyncBridgeHandler = (params: string, complete: (result: string) => void) => void;

/** Handler 注册项 */
export interface HandlerEntry {
  /** 方法名 */
  method: string;
  /** 是否为异步方法 */
  isAsync: boolean;
  /** 同步处理器 */
  syncHandler?: SyncBridgeHandler;
  /** 异步处理器 */
  asyncHandler?: AsyncBridgeHandler;
}
