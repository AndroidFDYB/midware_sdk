/**
 * javaScriptProxy 注入对象
 *
 * 注册到 window._dsbridge，供 bridge.js 调用。
 * 实现同步/异步 Native Handler 调用、方法存在性检查、回调结果回传。
 *
 * 使用方式（原生 Web 组件注入）：
 * ```typescript
 * import { DsBridgeProxy, JSBridgeManager } from 'hm_web_library';
 *
 * private bridgeManager = new JSBridgeManager(true);
 * private dsBridgeProxy = new DsBridgeProxy(this.bridgeManager);
 *
 * build() {
 *   Web({ src: url, controller: this.controller })
 *     .javaScriptProxy({
 *       object: this.dsBridgeProxy,
 *       name: '_dsbridge',
 *       methodList: ['call', 'callAsync', 'hasMethod', 'onNativeCallComplete'],
 *       controller: this.controller
 *     })
 * }
 * ```
 */

import { JSBridgeManager } from './JSBridge';

export class DsBridgeProxy {
  private manager: JSBridgeManager;

  constructor(manager: JSBridgeManager) {
    this.manager = manager;
  }

  /**
   * 同步调用 Native Handler
   * @param requestJson BridgeRequest JSON 字符串
   * @returns BridgeResponse JSON 字符串
   */
  call(requestJson: string): string {
    return this.manager.handleSyncCall(requestJson);
  }

  /**
   * 异步调用 Native Handler
   * @param requestJson BridgeRequest JSON 字符串
   * @returns 空字符串
   */
  callAsync(requestJson: string): string {
    return this.manager.handleAsyncCall(requestJson);
  }

  /**
   * 检查方法是否存在
   * @param method 方法名
   * @returns 是否存在
   */
  hasMethod(method: string): boolean {
    return this.manager.hasMethod(method);
  }

  /**
   * Native 调用 JS 后的结果回传
   * @param callbackId 回调 ID
   * @param result 结果
   */
  onNativeCallComplete(callbackId: string, result: string): void {
    this.manager.onNativeCallComplete(callbackId, result);
  }
}
