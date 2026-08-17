/**
 * JSBridge 核心管理类
 *
 * 负责 Handler 的注册、分发和 Native->JS 调用管理。
 * 通过 javaScriptProxy 注入到 WebView 的 window._dsbridge 对象。
 *
 * 协议兼容 DSBridge（wendux），使前端可以使用 dsbridge npm 包。
 */
import { BridgeRequest, BridgeResponse, NativeCallRequest } from './BridgeModels';
import { HandlerEntry, SyncBridgeHandler, AsyncBridgeHandler } from './BridgeHandler';
import { webview } from '@kit.ArkWeb';

export class JSBridgeManager {
  /** 注册的 Handler 表：method -> HandlerEntry */
  private handlers: Map<string, HandlerEntry> = new Map();

  /** 异步回调映射：callbackId -> ArkTS 侧回调函数 */
  private asyncCallbacks: Map<string, (result: string) => void> = new Map();

  /** 自增回调 ID 计数器 */
  private callbackIdCounter: number = 0;

  /** WebView 控制器引用（用于调用 JS） */
  private webController: webview.WebviewController | null = null;

  /** 调试模式 */
  private debug: boolean = false;

  constructor(debug: boolean = false) {
    this.debug = debug;
  }

  /**
   * 绑定 WebView 控制器
   */
  setWebController(controller: webview.WebviewController): void {
    this.webController = controller;
  }

  /**
   * 注册同步 Handler
   * @param method 方法名
   * @param handler 同步处理器
   */
  registerHandler(method: string, handler: SyncBridgeHandler): void {
    const entry: HandlerEntry = {
      method: method,
      isAsync: false,
      syncHandler: handler,
    };
    this.handlers.set(method, entry);
    this.log(`registerHandler: ${method} (sync)`);
  }

  /**
   * 注册异步 Handler
   * @param method 方法名
   * @param handler 异步处理器
   */
  registerAsyncHandler(method: string, handler: AsyncBridgeHandler): void {
    const entry: HandlerEntry = {
      method: method,
      isAsync: true,
      asyncHandler: handler,
    };
    this.handlers.set(method, entry);
    this.log(`registerAsyncHandler: ${method} (async)`);
  }

  /**
   * 检查方法是否已注册（供 javaScriptProxy 调用）
   * @param method 方法名
   * @returns 是否已注册
   */
  hasMethod(method: string): boolean {
    return this.handlers.has(method);
  }

  /**
   * 处理 JS 同步调用（供 javaScriptProxy 调用）
   * @param requestJson BridgeRequest JSON 字符串
   * @returns BridgeResponse JSON 字符串
   */
  handleSyncCall(requestJson: string): string {
    this.log(`handleSyncCall: ${requestJson}`);
    try {
      const request: BridgeRequest = JSON.parse(requestJson) as BridgeRequest;
      const entry = this.handlers.get(request.method);

      if (!entry) {
        const response: BridgeResponse = {
          callbackId: request.callbackId,
          code: -1,
          data: '',
          message: `Method not found: ${request.method}`,
        };
        return JSON.stringify(response);
      }

      if (entry.isAsync) {
        const response: BridgeResponse = {
          callbackId: request.callbackId,
          code: -2,
          data: '',
          message: `Method ${request.method} is async, use handleAsyncCall`,
        };
        return JSON.stringify(response);
      }

      const result = entry.syncHandler!(request.params);
      const response: BridgeResponse = {
        callbackId: request.callbackId,
        code: 0,
        data: result,
        message: 'success',
      };
      return JSON.stringify(response);
    } catch (e) {
      const errorResponse: BridgeResponse = {
        callbackId: '',
        code: -2,
        data: '',
        message: `Exception: ${e}`,
      };
      return JSON.stringify(errorResponse);
    }
  }

  /**
   * 处理 JS 异步调用（供 javaScriptProxy 调用）
   * @param requestJson BridgeRequest JSON 字符串
   * @returns 空字符串（结果通过 JS 回调返回）
   */
  handleAsyncCall(requestJson: string): string {
    this.log(`handleAsyncCall: ${requestJson}`);
    try {
      const request: BridgeRequest = JSON.parse(requestJson) as BridgeRequest;
      const entry = this.handlers.get(request.method);

      if (!entry) {
        this.sendResponseToJs(request.callbackId, -1, '', `Method not found: ${request.method}`);
        return '';
      }

      if (!entry.isAsync) {
        // 同步方法被异步调用，自动包装为异步返回
        const result = entry.syncHandler!(request.params);
        this.sendResponseToJs(request.callbackId, 0, result, 'success');
        return '';
      }

      entry.asyncHandler!(request.params, (result: string) => {
        this.sendResponseToJs(request.callbackId, 0, result, 'success');
      });
    } catch (e) {
      this.log(`handleAsyncCall exception: ${e}`);
    }
    return '';
  }

  /**
   * Native 调用 JS 方法
   * @param method JS 方法名
   * @param args 参数数组
   * @param callback 返回值回调（可选）
   */
  callJs(method: string, args?: Object[], callback?: (result: string) => void): void {
    const callbackId = `native_cb_${this.callbackIdCounter++}`;
    const request: NativeCallRequest = {
      callbackId: callbackId,
      method: method,
      params: args ? JSON.stringify(args) : '[]',
    };

    if (callback) {
      this.asyncCallbacks.set(callbackId, callback);
    }

    const jsCode = `window._dsBridge._handleNativeCall(${JSON.stringify(request)});`;
    this.runJavaScript(jsCode);
  }

  /**
   * 处理 JS 端对 Native 调用的返回（供 javaScriptProxy 调用）
   * @param callbackId 回调 ID
   * @param result 结果 JSON 字符串
   */
  onNativeCallComplete(callbackId: string, result: string): void {
    const callback = this.asyncCallbacks.get(callbackId);
    if (callback) {
      callback(result);
      this.asyncCallbacks.delete(callbackId);
    }
  }

  /**
   * 向 JS 发送异步调用结果
   */
  private sendResponseToJs(callbackId: string, code: number, data: string, message: string): void {
    const response: BridgeResponse = { callbackId, code, data, message };
    const jsCode = `window._dsBridge._handleResponse(${JSON.stringify(response)});`;
    this.runJavaScript(jsCode);
  }

  /**
   * 执行 JS 代码
   */
  private runJavaScript(code: string): void {
    if (this.webController) {
      this.webController.runJavaScript(code);
    } else {
      this.log(`runJavaScript failed: webController is null, code=${code}`);
    }
  }

  private log(msg: string): void {
    if (this.debug) {
      console.log(`[MPBridge] ${msg}`);
    }
  }
}
