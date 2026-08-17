/**
 * BridgeUtils — 鸿蒙端桥接工具类
 *
 * 提供桥接注入和平台参数追加的静态工具方法，
 * 供页面直接使用原生 Web 组件时调用，降低 SDK 侵入性。
 *
 * 使用方式（原生 Web 组件 + 工具注入）：
 * ```typescript
 * import { BridgeUtils, DsBridgeProxy, JSBridgeManager, DataSyncHelper } from 'hm_web_library';
 *
 * @Entry
 * @Component
 * struct LoanPage {
 *   private bridgeManager = new JSBridgeManager(true);
 *   private dataSyncHelper = new DataSyncHelper(this.bridgeManager, ['userInfo', 'loanInfo'], true);
 *   private dsBridgeProxy = new DsBridgeProxy(this.bridgeManager);
 *   private controller = new webview.WebviewController();
 *   private finalUrl = '';
 *
 *   aboutToAppear() {
 *     this.finalUrl = BridgeUtils.appendPlatformParam('resource://rawfile/demo.html');
 *     this.dataSyncHelper.setUserInfo('{"uid":"123"}');
 *   }
 *
 *   build() {
 *     Web({ src: this.finalUrl, controller: this.controller })
 *       .javaScriptProxy({
 *         object: this.dsBridgeProxy,
 *         name: '_dsbridge',
 *         methodList: ['call', 'callAsync', 'hasMethod', 'onNativeCallComplete'],
 *         controller: this.controller
 *       })
 *       .onPageBegin(() => {
 *         this.bridgeManager.setWebController(this.controller);
 *         BridgeUtils.injectBridgeJs(this.controller, getContext(this));
 *         this.dataSyncHelper.notifyPageLoading();
 *       })
 *       .onPageEnd(() => {
 *         this.dataSyncHelper.notifyPageLoaded();
 *       })
 *   }
 * }
 * ```
 */

import { webview } from '@kit.ArkWeb';

export class BridgeUtils {
  /**
   * 在 URL 上追加 platform=harmony 查询参数
   * 如果 URL 已包含 platform 参数则不重复追加
   *
   * @param url 原始 URL
   * @returns 追加平台参数后的 URL
   */
  static appendPlatformParam(url: string): string {
    if (url.includes('platform=')) {
      return url;
    }
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}platform=harmony`;
  }

  /**
   * 注入 bridge.js 到 WebView
   * 从 rawfile 读取 bridge.js 并通过 controller.runJavaScript 执行
   *
   * @param controller WebviewController 实例
   * @param context 上下文对象（通过 getContext(this) 获取）
   */
  static injectBridgeJs(controller: webview.WebviewController, context: Context): void {
    try {
      let rawFile = context.resourceManager.getRawFileContentSync('bridge.js');
      let bridgeJsCode = rawFile.toString();
      controller.runJavaScript(bridgeJsCode);
      console.log('[BridgeUtils] bridge.js injected successfully');
    } catch (e) {
      console.error('[BridgeUtils] Failed to inject bridge.js:', JSON.stringify(e));
    }
  }
}
