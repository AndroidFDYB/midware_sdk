import { router } from '@kit.ArkUI';

/**
 * Index — 首页导航
 *
 * 提供入口按钮导航到数据同步验证页面：
 * - LoanPage: 验证 userInfo + loanInfo 通道
 * - VipPage: 验证 userInfo + vipInfo 通道
 */

@Entry
@Component
struct Index {
  build() {
    Column() {
      Text('MP-SDK 数据同步验证')
        .fontSize(20)
        .fontWeight(FontWeight.Bold)
        .margin({ top: 60, bottom: 8 })

      Text('选择验证页面')
        .fontSize(14)
        .fontColor('#999')
        .margin({ bottom: 40 })

      // 导航到 LoanPage
      Button('借款页面 (WebViewForLoan)')
        .fontSize(16)
        .width('80%')
        .height(48)
        .margin({ bottom: 16 })
        .onClick(() => {
          router.pushUrl({ url: 'pages/LoanPage' })
        })

      // 导航到 VipPage
      Button('会员页面 (VipPage)')
        .fontSize(16)
        .width('80%')
        .height(48)
        .margin({ bottom: 16 })
        .onClick(() => {
          router.pushUrl({ url: 'pages/VipPage' })
        })

      // 说明
      Text('点击按钮后，页面将自动：\n1. 追加 ?platform=harmony\n2. 设置业务数据\n3. 页面加载完成后推送数据')
        .fontSize(12)
        .fontColor('#aaa')
        .textAlign(TextAlign.Center)
        .margin({ top: 40, left: 24, right: 24 })
    }
    .width('100%')
    .height('100%')
    .justifyContent(FlexAlign.Start)
    .alignItems(HorizontalAlign.Center)
  }
}
