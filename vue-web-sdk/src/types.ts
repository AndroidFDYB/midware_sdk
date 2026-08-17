/**
 * MPBridge 类型定义
 */

/** 平台标识 */
export type Platform = 'android' | 'harmony' | 'web' | 'unknown';

/** 同步 Handler 签名 */
export type SyncHandler = (params: any) => any;

/** 异步 Handler 签名 */
export type AsyncHandler = (params: any, completionHandler: (result: any) => void) => void;

/** JSBridge 统一接口 */
export interface IMPBridge {
  /** 获取当前运行平台 */
  getPlatform(): Platform;

  /** 调用 Native 方法（同步） */
  call(method: string, params?: any): any;

  /** 调用 Native 方法（异步） */
  callAsync(method: string, params?: any): Promise<any>;

  /** 调用 Native 方法（回调形式） */
  call(method: string, params: any, callback: (result: any) => void): void;

  /** 注册同步方法供 Native 调用 */
  register(method: string, handler: SyncHandler): void;

  /** 注册异步方法供 Native 调用 */
  registerAsyn(method: string, handler: AsyncHandler): void;

  /** 注册命名空间下的方法 */
  register(namespace: string, apiObject: Record<string, Function>): void;

  /** 注册命名空间下的异步方法 */
  registerAsyn(namespace: string, apiObject: Record<string, Function>): void;

  /** 检测当前是否处于 Native WebView 环境 */
  hasNativeBridge(): boolean;

  /** 检查方法是否已注册 */
  hasMethod(method: string): boolean;
}

/**
 * Android JsBridge 协议接口（happydog-intj/JsBridge）
 * Android 端通过 BridgeWebView 自动注入 window.WebViewJavascriptBridge
 */
export interface IAndroidJsBridge {
  /** 注册 JS Handler 供 Native 调用 */
  registerHandler(handlerName: string, handler: (data: string, responseCallback: (responseData: string) => void) => void): void;
  /** 调用 Native Handler */
  callHandler(handlerName: string, data: any, responseCallback: (responseData: string) => void): void;
  /** 初始化 bridge（由 BridgeWebView 内部调用） */
  init?(message: any): void;
}

/**
 * 鸿蒙 DSBridge 兼容协议接口
 * 鸿蒙端通过 MPBridgeWeb 注入 window.dsBridge
 */
export interface IHarmonyBridge {
  call(method: string, params?: any): any;
  callAsync(method: string, params?: any, callback?: (result: any) => void): void;
  register(method: string, handler: Function | Record<string, Function>): void;
  registerAsyn(method: string, handler: Function | Record<string, Function>): void;
  hasMethod(method: string): boolean;
}
