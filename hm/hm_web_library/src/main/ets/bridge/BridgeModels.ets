/**
 * MPBridge 数据模型定义
 * 与 bridge-protocol.ts 保持一致的协议格式
 */

/** JS -> Native 调用请求 */
export interface BridgeRequest {
  /** 回调 ID，异步调用时非空 */
  callbackId: string;
  /** 方法名 */
  method: string;
  /** 参数 */
  params: string;
}

/** Native -> JS 响应 */
export interface BridgeResponse {
  /** 对应的回调 ID */
  callbackId: string;
  /** 状态码：0=成功，-1=方法不存在，-2=执行异常 */
  code: number;
  /** 返回数据（JSON 字符串） */
  data: string;
  /** 描述信息 */
  message: string;
}

/** Native -> JS 调用请求 */
export interface NativeCallRequest {
  /** 回调 ID */
  callbackId: string;
  /** JS 方法名 */
  method: string;
  /** 参数（JSON 字符串） */
  params: string;
}
