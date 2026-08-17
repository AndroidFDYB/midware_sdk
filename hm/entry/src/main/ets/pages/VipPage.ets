/**
 * VipPage — 会员页面数据同步验证（原生 Web + 工具注入）
 *
 * 验证鸿蒙端 DataSyncHelper 的 VipInfo 通道：
 * 1. 创建 DataSyncHelper 声明所需通道 [USER_INFO, VIP_INFO]
 * 2. aboutToAppear 中设置用户信息和会员信息
 * 3. 使用原生 Web 组件 + BridgeUtils 工具注入桥接逻辑
 * 4. onPageEnd 时通知 DataSyncHelper 触发数据推送
 *
 * 验证点：
 * - DataSyncChannel.VIP_INFO → syncVipInfo 方法名
 * - callJs("syncVipInfo", [data]) 推送到 JS
 *
 * 与旧版差异：
 * - 不使用 MPBridgeWeb 封装组件，直接使用原生 Web 组件
 * - 通过 DsBridgeProxy + BridgeUtils 工具注入桥接逻辑，侵入性更低
 */

import { webview } from '@kit.ArkWeb';
import { router } from '@kit.ArkUI';
import {
  JSBridgeManager,
  DataSyncHelper,
  DataSyncChannel,
  DsBridgeProxy,
  BridgeUtils
} from 'hm_web_library';

@Entry
@Component
struct VipPage {
  private bridgeManager: JSBridgeManager = new JSBridgeManager(true);
  private dataSyncHelper: DataSyncHelper = new DataSyncHelper(
    this.bridgeManager,
    [DataSyncChannel.USER_INFO, DataSyncChannel.VIP_INFO],
    true
  );
  private dsBridgeProxy: DsBridgeProxy = new DsBridgeProxy(this.bridgeManager);
  @State controller: webview.WebviewController = new webview.WebviewController();
  @State statusText: string = '准备中...';
  private finalUrl: string = '';

  aboutToAppear(): void {
    // 设置用户信息和会员信息
    this.dataSyncHelper.setUserInfo('{"uid":"user_002","ticket":"ticket_xyz789"}');
    this.dataSyncHelper.setVipInfo('{"level":"gold","points":12500,"expireDate":"2025-12-31"}');
    // 计算最终 URL（追加 platform=harmony）
    this.finalUrl = BridgeUtils.appendPlatformParam('resource://rawfile/demo.html');
    this.statusText = '数据已设置 → 加载页面中';
  }

  build() {
    Column() {
      // 顶部状态栏
      Row() {
        Button('返回')
          .fontSize(14)
          .onClick(() => router.back())
          .margin({ left: 12 })
        Text('VipPage 数据同步验证')
          .fontSize(16)
          .fontWeight(FontWeight.Bold)
          .layoutWeight(1)
          .textAlign(TextAlign.Center)
      }
      .width('100%')
      .height(56)
      .backgroundColor('#f5f5f5')

      // 状态文本
      Text(this.statusText)
        .fontSize(12)
        .fontColor('#666')
        .padding(12)
        .width('100%')

      // 原生 Web 组件 + 工具注入
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
          // 注入 bridge.js + 通知页面开始加载
          this.bridgeManager.setWebController(this.controller);
          BridgeUtils.injectBridgeJs(this.controller, getContext(this));
          this.dataSyncHelper.notifyPageLoading();
        })
        .onPageEnd(() => {
          // 通知页面加载完成 → 触发数据推送
          this.dataSyncHelper.notifyPageLoaded();
          this.statusText = '页面已加载 → 数据已推送';
        })
        .layoutWeight(1)
        .width('100%')
    }
    .width('100%')
    .height('100%')
  }
}
