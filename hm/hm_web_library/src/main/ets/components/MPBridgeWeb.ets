/**
 * MPBridgeWeb 组件
 *
 * 基于鸿蒙官方 Web 组件封装的 JSBridge WebView 组件。
 * 通过 javaScriptProxy 注入桥接对象，实现 JS <-> Native 双向通信。
 *
 * 自动集成数据同步辅助器：
 * - 加载 URL 时自动追加 ?platform=harmony 查询参数
 * - 页面加载开始时通知 DataSyncHelper.notifyPageLoading()
 * - 页面加载完成时通知 DataSyncHelper.notifyPageLoaded()
 *
 * 使用方式：
 * ```typescript
 * import { MPBridgeWeb, JSBridgeManager, DataSyncHelper, DataSyncChannel } from 'hm_web_library'
 *
 * @Entry
 * @Component
 * struct LoanPage {
 *   private bridgeManager: JSBridgeManager = new JSBridgeManager(true);
 *   private dataSyncHelper: DataSyncHelper = new DataSyncHelper(
 *     this.bridgeManager,
 *     [DataSyncChannel.USER_INFO, DataSyncChannel.LOAN_INFO],
 *     true
 *   );
 *   @State controller: webview.WebviewController = new webview.WebviewController();
 *
 *   build() {
 *     MPBridgeWeb({
 *       bridgeManager: this.bridgeManager,
 *       url: 'https://your-page.com',
 *       debug: true,
 *       dataSyncHelper: this.dataSyncHelper,
 *       controller: this.controller
 *     })
 *   }
 *
 *   aboutToAppear() {
 *     this.dataSyncHelper.setUserInfo('{"uid":"123","ticket":"abc"}');
 *     this.dataSyncHelper.setLoanInfo('{"loanId":"L001","amount":50000}');
 *   }
 * }
 * ```
 */
import { webview } from '@kit.ArkWeb';
import { JSBridgeManager } from '../bridge/JSBridge';
import { SyncBridgeHandler, AsyncBridgeHandler } from '../bridge/BridgeHandler';
import { DataSyncHelper } from '../bridge/DataSyncHelper';
import { DsBridgeProxy } from '../bridge/DsBridgeProxy';
import { BridgeUtils } from '../bridge/BridgeUtils';

@Component
export struct MPBridgeWeb {
  /** JSBridge 管理器实例 */
  @Prop bridgeManager: JSBridgeManager = new JSBridgeManager();
  /** 要加载的 URL */
  @Prop url: string = '';
  /** 是否开启调试模式 */
  @Prop debug: boolean = false;
  /** 数据同步辅助器（可选，传入后自动管理页面加载状态通知） */
  @Prop dataSyncHelper: DataSyncHelper = new DataSyncHelper(new JSBridgeManager(), [], false);
  /** WebView 控制器（外部可传入以获取控制权） */
  @Link controller: webview.WebviewController;

  /** 内部代理对象 */
  private dsBridgeProxy: DsBridgeProxy = new DsBridgeProxy(this.bridgeManager);
  /** 最终加载的 URL（追加 platform 参数后） */
  private finalUrl: string = '';

  aboutToAppear(): void {
    // 启用 WebView 调试
    if (this.debug) {
      webview.WebviewController.initializeWebEngine();
      console.log('[MPBridgeWeb] aboutToAppear, debug mode enabled');
    }
    // 计算 URL，追加平台参数
    this.finalUrl = BridgeUtils.appendPlatformParam(this.url);
  }

  build() {
    Web({ src: this.finalUrl, controller: this.controller })
      .javaScriptAccess(true)
      .domStorageAccess(true)
      .javaScriptProxy({
        object: this.dsBridgeProxy,
        name: '_dsbridge',
        methodList: ['call', 'callAsync', 'hasMethod', 'onNativeCallComplete'],
        controller: this.controller
      })
      .onPageBegin(() => {
        // 页面开始加载时注入 bridge.js
        this.bridgeManager.setWebController(this.controller);
        BridgeUtils.injectBridgeJs(this.controller, getContext(this));
        // 通知数据同步辅助器页面开始加载（重置推送状态）
        this.dataSyncHelper.notifyPageLoading();
      })
      .onPageEnd(() => {
        if (this.debug) {
          console.log('[MPBridgeWeb] page loaded:', this.finalUrl);
        }
        // 通知数据同步辅助器页面加载完成（触发数据推送）
        this.dataSyncHelper.notifyPageLoaded();
      })
      .width('100%')
      .height('100%');
  }

}
