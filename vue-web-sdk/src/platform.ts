/**
 * 平台检测模块
 *
 * 支持两种平台检测方式：
 * 1. URL 查询参数：Native 加载 WebView 时在 URL 追加 ?platform=android 或 ?platform=harmony
 * 2. Window 对象检测：检测 window.WebViewJavascriptBridge（Android）/ window.dsBridge（鸿蒙）
 *
 * 检测优先级：URL 参数 > Window 对象检测 > 纯 Web
 *
 * 使用方式：
 * ```typescript
 * import { detectPlatformFromUrl, getPlatform } from '@mp-sdk/bridge';
 *
 * // 从 URL 获取平台（Native 加载时传入）
 * const platform = detectPlatformFromUrl(); // 'android' | 'harmony' | null
 *
 * // 综合检测（URL 优先，其次 window 对象）
 * const platform = getPlatform(); // 'android' | 'harmony' | 'web' | 'unknown'
 * ```
 */

import type { Platform } from './types';

/** URL 查询参数中的平台标识键名 */
export const PLATFORM_QUERY_KEY = 'platform';

/** 有效的平台标识值 */
const VALID_PLATFORMS: Platform[] = ['android', 'harmony', 'web'];

/**
 * 从当前页面 URL 的查询参数中读取平台标识
 *
 * Native 端加载 WebView 时应在 URL 中追加查询参数：
 * - Android: `https://your-page.com?platform=android`
 * - 鸿蒙: `https://your-page.com?platform=harmony`
 *
 * @returns 平台标识，如果 URL 中无平台参数则返回 null
 */
export function detectPlatformFromUrl(): Platform | null {
  if (typeof window === 'undefined' || !window.location) {
    return null;
  }

  const params = new URLSearchParams(window.location.search);
  const platform = params.get(PLATFORM_QUERY_KEY);

  if (platform && VALID_PLATFORMS.includes(platform as Platform)) {
    return platform as Platform;
  }

  return null;
}

/**
 * 通过 Window 对象检测平台
 *
 * Android: BridgeWebView 自动注入 window.WebViewJavascriptBridge
 * 鸿蒙: MPBridgeWeb 注入 window.dsBridge + window.__harmony_bridge
 */
export function detectPlatformFromWindow(): Platform {
  if (typeof window === 'undefined') {
    return 'unknown';
  }

  const w = window as any;

  // Android: JsBridge 注入 WebViewJavascriptBridge
  if (w.WebViewJavascriptBridge) {
    return 'android';
  }

  // 鸿蒙: 自定义协议注入
  if (w.__harmony_bridge && w.dsBridge) {
    return 'harmony';
  }

  return 'web';
}

/**
 * 综合平台检测
 *
 * 检测优先级：
 * 1. URL 查询参数（Native 显式传入，最可靠）
 * 2. Window 对象检测（JSBridge 注入的对象）
 * 3. 默认返回 'web'
 *
 * @returns 当前运行平台
 */
export function getPlatform(): Platform {
  // 1. 优先从 URL 参数获取
  const urlPlatform = detectPlatformFromUrl();
  if (urlPlatform) {
    return urlPlatform;
  }

  // 2. 其次从 Window 对象检测
  return detectPlatformFromWindow();
}

/**
 * 检测当前是否在 Native WebView 环境中
 * （非纯 Web 环境）
 */
export function isNativeEnvironment(): boolean {
  const platform = getPlatform();
  return platform === 'android' || platform === 'harmony';
}

/**
 * 获取平台检测的详细信息（用于调试）
 */
export function getPlatformDebugInfo(): {
  urlPlatform: Platform | null;
  windowPlatform: Platform;
  finalPlatform: Platform;
  hasAndroidBridge: boolean;
  hasHarmonyBridge: boolean;
  url: string | null;
} {
  const w = typeof window !== 'undefined' ? (window as any) : null;
  return {
    urlPlatform: detectPlatformFromUrl(),
    windowPlatform: detectPlatformFromWindow(),
    finalPlatform: getPlatform(),
    hasAndroidBridge: !!w?.WebViewJavascriptBridge,
    hasHarmonyBridge: !!(w?.__harmony_bridge && w?.dsBridge),
    url: w?.location?.href ?? null,
  };
}
