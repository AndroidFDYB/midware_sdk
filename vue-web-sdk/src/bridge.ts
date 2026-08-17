/**
 * MPBridge 核心实现
 *
 * 提供统一的跨平台 JSBridge API，自动检测运行环境并适配不同的 Native 桥接：
 *
 * - Android：使用 happydog-intj/JsBridge，通过 BridgeWebView 自动注入 window.WebViewJavascriptBridge
 *   JS 端使用 setupWebViewJavascriptBridge() 初始化，bridge.callHandler / bridge.registerHandler
 *
 * - 鸿蒙：使用 MPBridgeWeb 组件注入 bridge.js，提供 window.dsBridge（自定义协议）
 *   JS 端使用 dsBridge.call / dsBridge.callAsync / dsBridge.register
 *
 * - 纯 Web：提供 fallback 实现，方法调用会输出警告
 */

import type { Platform, IMPBridge, SyncHandler, AsyncHandler, IAndroidJsBridge, IHarmonyBridge } from './types';
import { getDataSyncManager } from './data-sync/manager';
import { getPlatform as getPlatformEnhanced } from './platform';
// setupDataSyncHandlers 由 proto codegen 自动生成
import { setupDataSyncHandlers as registerDataSyncHandlers } from './data-sync/generated/handlers.gen';

// ========================
// 平台检测
// ========================

type BridgeType = 'android-jsbridge' | 'harmony-dsbridge' | 'none';

interface DetectResult {
  platform: Platform;
  bridgeType: BridgeType;
}

/**
 * 检测当前平台和桥接类型
 *
 * Android (JsBridge): window.WebViewJavascriptBridge 由 BridgeWebView 注入
 *   需要通过 setupWebViewJavascriptBridge(callback) 等待 bridge ready
 *
 * 鸿蒙 (自定义协议): window.dsBridge + window.__harmony_bridge 由 MPBridgeWeb 注入
 */
function detect(): DetectResult {
  if (typeof window === 'undefined') {
    return { platform: 'unknown', bridgeType: 'none' };
  }
  const w = window as any;

  // Android: JsBridge 注入 window.WebViewJavascriptBridge
  if (w.WebViewJavascriptBridge) {
    return { platform: 'android', bridgeType: 'android-jsbridge' };
  }

  // 鸿蒙: 自定义 bridge.js 注入 window.dsBridge + window.__harmony_bridge
  if (w.__harmony_bridge && w.dsBridge) {
    return { platform: 'harmony', bridgeType: 'harmony-dsbridge' };
  }

  // 纯 Web
  return { platform: 'web', bridgeType: 'none' };
}

// ========================
// Android JsBridge 适配层
// ========================

/**
 * 等待 Android JsBridge 就绪
 * BridgeWebView 会触发 WebViewJavascriptBridgeReady 事件
 */
function waitForAndroidBridge(callback: (bridge: IAndroidJsBridge) => void): void {
  const w = window as any;
  if (w.WebViewJavascriptBridge) {
    callback(w.WebViewJavascriptBridge);
    return;
  }
  // 监听 bridge ready 事件
  const handler = (event: any) => {
    callback(w.WebViewJavascriptBridge);
    document.removeEventListener('WebViewJavascriptBridgeReady', handler);
  };
  document.addEventListener('WebViewJavascriptBridgeReady', handler, false);
}

/**
 * 将 Android JsBridge 适配为统一接口
 */
class AndroidBridgeAdapter {
  private bridge: IAndroidJsBridge;
  private registeredMethods: Set<string> = new Set();

  constructor(bridge: IAndroidJsBridge) {
    this.bridge = bridge;
  }

  /** 调用 Native Handler */
  callHandler(method: string, data: any, callback: (result: string) => void): void {
    const dataStr = typeof data === 'string' ? data : JSON.stringify(data ?? {});
    this.bridge.callHandler(method, dataStr, callback);
  }

  /** 注册 JS Handler */
  registerHandler(method: string, handler: (data: string, responseCallback: (result: string) => void) => void): void {
    this.bridge.registerHandler(method, handler);
    this.registeredMethods.add(method);
  }

  hasMethod(method: string): boolean {
    return this.registeredMethods.has(method);
  }
}

// ========================
// 鸿蒙 DSBridge 适配层
// ========================

class HarmonyBridgeAdapter {
  private bridge: IHarmonyBridge;

  constructor(bridge: IHarmonyBridge) {
    this.bridge = bridge;
  }

  call(method: string, params?: any): any {
    return this.bridge.call(method, params);
  }

  callAsync(method: string, params?: any, callback?: (result: any) => void): void {
    this.bridge.callAsync(method, params, callback);
  }

  register(method: string, handler: Function | Record<string, Function>): void {
    this.bridge.register(method, handler);
  }

  registerAsyn(method: string, handler: Function | Record<string, Function>): void {
    this.bridge.registerAsyn(method, handler);
  }

  hasMethod(method: string): boolean {
    return this.bridge.hasMethod(method);
  }
}

// ========================
// MPBridge 统一实现
// ========================

class MPBridgeImpl implements IMPBridge {
  private detectResult: DetectResult;
  private androidAdapter: AndroidBridgeAdapter | null = null;
  private harmonyAdapter: HarmonyBridgeAdapter | null = null;
  private jsHandlers: Map<string, SyncHandler> = new Map();
  private jsAsyncHandlers: Map<string, AsyncHandler> = new Map();
  private ready: boolean = false;
  private pendingCalls: Array<() => void> = [];

  constructor() {
    this.detectResult = detect();
    this.initBridge();
  }

  private initBridge(): void {
    const { platform, bridgeType } = this.detectResult;
    const w = typeof window !== 'undefined' ? window as any : null;

    if (bridgeType === 'android-jsbridge' && w?.WebViewJavascriptBridge) {
      // Android: 等待 bridge ready 后初始化
      waitForAndroidBridge((bridge) => {
        this.androidAdapter = new AndroidBridgeAdapter(bridge);
        this.onReady();
      });
    } else if (bridgeType === 'harmony-dsbridge' && w?.dsBridge) {
      // 鸿蒙: bridge 已就绪
      this.harmonyAdapter = new HarmonyBridgeAdapter(w.dsBridge as IHarmonyBridge);
      this.onReady();
    } else {
      // 纯 Web 或 bridge 尚未注入
      this.ready = true;
    }
  }

  private onReady(): void {
    this.ready = true;
    // 注册缓存的 JS handlers
    this.jsHandlers.forEach((handler, method) => {
      this.registerToNative(method, handler, false);
    });
    this.jsAsyncHandlers.forEach((handler, method) => {
      this.registerToNative(method, handler, true);
    });
    // 自动注册数据同步 Handler（Native → JS 数据推送）
    if (!dataSyncHandlersRegistered) {
      registerDataSyncHandlers();
      dataSyncHandlersRegistered = true;
    }
    // 执行待处理的调用
    this.pendingCalls.forEach(fn => fn());
    this.pendingCalls = [];
  }

  getPlatform(): Platform {
    // 优先使用增强版平台检测（URL 参数 > Window 对象）
    return getPlatformEnhanced();
  }

  hasNativeBridge(): boolean {
    return this.androidAdapter !== null || this.harmonyAdapter !== null;
  }

  /**
   * 同步调用 Native 方法
   * 注意：Android JsBridge 只支持异步回调，同步调用仅鸿蒙端支持
   */
  call(method: string, params?: any): any {
    if (!this.ready) {
      console.warn(`[MPBridge] Bridge not ready. Queuing call to "${method}".`);
      return null;
    }
    if (this.harmonyAdapter) {
      return this.harmonyAdapter.call(method, params);
    }
    if (this.androidAdapter) {
      // Android JsBridge 不支持同步返回，使用异步
      console.warn(`[MPBridge] Android JsBridge does not support synchronous calls. Use callAsync instead.`);
      return null;
    }
    console.warn(`[MPBridge] No native bridge. Cannot call "${method}". Platform: ${this.detectResult.platform}`);
    return null;
  }

  /**
   * 异步调用 Native 方法（返回 Promise）
   */
  callAsync(method: string, params?: any): Promise<any> {
    return new Promise((resolve) => {
      const doCall = () => {
        if (this.androidAdapter) {
          this.androidAdapter.callHandler(method, params, (result: string) => {
            try { resolve(JSON.parse(result)); }
            catch (e) { resolve(result); }
          });
          return;
        }
        if (this.harmonyAdapter) {
          this.harmonyAdapter.callAsync(method, params, (result: any) => {
            resolve(result);
          });
          return;
        }
        console.warn(`[MPBridge] No native bridge. Cannot callAsync "${method}".`);
        resolve(null);
      };

      if (this.ready) {
        doCall();
      } else {
        this.pendingCalls.push(doCall);
      }
    });
  }

  /**
   * 注册同步方法供 Native 调用
   */
  register(methodOrNamespace: string, handlerOrObject: SyncHandler | Record<string, Function>): void {
    if (typeof handlerOrObject === 'function') {
      this.jsHandlers.set(methodOrNamespace, handlerOrObject as SyncHandler);
    } else {
      const obj = handlerOrObject as Record<string, Function>;
      for (const key of Object.keys(obj)) {
        if (typeof obj[key] === 'function') {
          this.jsHandlers.set(`${methodOrNamespace}.${key}`, obj[key] as SyncHandler);
        }
      }
    }
    if (this.ready) {
      this.registerToNative(methodOrNamespace, handlerOrObject, false);
    }
  }

  /**
   * 注册异步方法供 Native 调用
   */
  registerAsyn(methodOrNamespace: string, handlerOrObject: AsyncHandler | Record<string, Function>): void {
    if (typeof handlerOrObject === 'function') {
      this.jsAsyncHandlers.set(methodOrNamespace, handlerOrObject as AsyncHandler);
    } else {
      const obj = handlerOrObject as Record<string, Function>;
      for (const key of Object.keys(obj)) {
        if (typeof obj[key] === 'function') {
          this.jsAsyncHandlers.set(`${methodOrNamespace}.${key}`, obj[key] as AsyncHandler);
        }
      }
    }
    if (this.ready) {
      this.registerToNative(methodOrNamespace, handlerOrObject, true);
    }
  }

  hasMethod(method: string): boolean {
    if (this.jsHandlers.has(method) || this.jsAsyncHandlers.has(method)) return true;
    if (this.androidAdapter) return this.androidAdapter.hasMethod(method);
    if (this.harmonyAdapter) return this.harmonyAdapter.hasMethod(method);
    return false;
  }

  /**
   * 将 handler 注册到原生桥
   */
  private registerToNative(method: string, handlerOrObject: any, isAsync: boolean): void {
    if (this.androidAdapter && typeof handlerOrObject === 'function') {
      // Android: 统一包装为 (data, responseCallback) 签名
      this.androidAdapter.registerHandler(method, (data: string, responseCallback: (result: string) => void) => {
        let parsedData: any;
        try { parsedData = JSON.parse(data); } catch (e) { parsedData = data; }
        if (isAsync) {
          handlerOrObject(parsedData, (result: any) => {
            responseCallback(typeof result === 'string' ? result : JSON.stringify(result));
          });
        } else {
          const result = handlerOrObject(parsedData);
          responseCallback(typeof result === 'string' ? result : JSON.stringify(result));
        }
      });
    } else if (this.harmonyAdapter) {
      if (isAsync) {
        this.harmonyAdapter.registerAsyn(method, handlerOrObject);
      } else {
        this.harmonyAdapter.register(method, handlerOrObject);
      }
    }
  }
}

// ========================
// 单例管理
// ========================

let instance: IMPBridge | null = null;

/**
 * 获取 MPBridge 单例
 */
export function getBridge(): IMPBridge {
  if (!instance) {
    instance = new MPBridgeImpl();
  }
  return instance;
}

/**
 * 重置实例（用于测试或环境变化时）
 * 同时重置数据同步 Handler 注册标记，以便重新注册
 */
export function resetBridge(): void {
  instance = null;
  dataSyncHandlersRegistered = false;
}

// ========================
// 数据同步 Handler 注册
// ========================

/** 标记是否已注册数据同步 Handler */
let dataSyncHandlersRegistered = false;

/**
 * 注册数据同步 Handler（委托给 proto codegen 生成的函数）
 *
 * 当 Bridge 就绪后，自动注册以下 JS Handler 供 Native 调用：
 * - syncUserInfo：接收 Native 推送的用户信息
 * - syncLoanInfo：接收 Native 推送的借款信息
 * - syncVipInfo：接收 Native 推送的会员信息
 *
 * 此函数在 bridge onReady 时自动调用，也可手动调用以重新注册。
 */
export function setupDataSyncHandlers(): void {
  if (dataSyncHandlersRegistered) return;
  registerDataSyncHandlers();
  dataSyncHandlersRegistered = true;
}
