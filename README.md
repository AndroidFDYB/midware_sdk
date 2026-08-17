# MP-SDK

> **跨平台 JSBridge SDK 框架** — 为 Android / HarmonyOS / Web 三端提供统一的 WebView 双向通信与数据同步能力。

[![Platform](https://img.shields.io/badge/platform-Android%20%7C%20HarmonyOS%20%7C%20Web-blue)]()
[![License](https://img.shields.io/badge/license-Proprietary-red)]()

---

## 项目简介

MP-SDK 是一套面向金融/会员业务场景的跨平台 JSBridge SDK。它以 **Protocol Buffers** 作为唯一真相源（Single Source of Truth），驱动三端代码自动生成，实现 **零运行时依赖** 的前端 SDK、**编译期注解处理** 的 Android SDK、以及 **低侵入工具注入** 的鸿蒙 SDK。

### 核心特性

- **Proto 驱动 Codegen**：单一 `.proto` 文件定义数据通道，三端自动生成注解/装饰器/常量/setter
- **等待唤醒数据同步**：解决 Native→Web 大数据量传递的时序问题，请求自动阻塞直到数据就绪
- **零运行时前端依赖**：自动检测平台，无需 `protobuf.js` 或 `dsbridge` 包
- **Android 编译期注入**：KSP 扫描 `@Needs*` 注解，无运行时反射开销
- **鸿蒙低侵入集成**：原生 Web 组件 + 静态工具类，页面完全掌控配置
- **横向扩展**：新增通道只需在 proto 中添加一个 message

---

## 架构概览

```
┌─────────────────────────────────────────────────────────────┐
│                  specs/proto/channels.proto                 │
│                    (唯一真相源 - Proto 文件)                   │
└──────────┬──────────────────┬──────────────────┬────────────┘
           │                  │                  │
    ┌──────▼──────┐   ┌──────▼──────┐   ┌──────▼──────┐
    │  Android     │   │  Vue Web    │   │  HarmonyOS  │
    │  Codegen     │   │  Codegen    │   │  Codegen    │
    │ (Gradle Task │   │ (Vite 插件) │   │ (Node.js    │
    │  + KSP)      │   │             │   │  脚本)      │
    └──────┬──────┘   └──────┬──────┘   └──────┬──────┘
           │                  │                  │
    ┌──────▼──────┐   ┌──────▼──────┐   ┌──────▼──────┐
    │  AAR 产物    │   │  TGZ 产物   │   │  HAR 产物    │
    │  :library    │   │  ESM + CJS  │   │  ArkTS      │
    │  + :and_web  │   │  零依赖     │   │  + bridge.js│
    │  + :data-sync│   │             │   │             │
    │  -processor  │   │             │   │             │
    └─────────────┘   └─────────────┘   └─────────────┘
```

---

## 工程结构

```
mp_sdk/
├── specs/                          # 规范与设计文档
│   ├── proto/
│   │   ├── channels.proto          # SDK 标准数据通道（唯一真相源）
│   │   └── custom/                 # 集成方扩展通道（可选）
│   ├── proto-codegen/              # 共享 TS Proto 解析器
│   ├── Design.md                   # 架构设计文档
│   └── Wiki.md                     # 架构变更记录
│
├── specsv2/                        # SSD 规范驱动开发文档
│   ├── proposal.md                 # 需求 + 功能模块 + 接口 + 任务 DAG
│   ├── constraints.md              # 项目/技术栈/团队约束
│   ├── harness.md                  # Harness 军团规范
│   └── capabilities.md             # MCP/Skill 接入规范
│
├── android/                        # Android SDK 工程
│   ├── library/                    # JsBridge 源码模块（Java）
│   ├── and_web_library/            # Android SDK 模块（Kotlin → AAR）
│   ├── data-sync-processor/        # KSP 注解处理器（纯 JVM）
│   ├── proto-codegen/              # Proto 解析器（纯 JVM）
│   └── app/                        # 示例应用
│
├── hm/                             # 鸿蒙 SDK 工程
│   └── hm_web_library/             # 鸿蒙 SDK 模块（ArkTS → HAR）
│
├── vue-web-sdk/                    # 前端 SDK（TypeScript → TGZ）
│   ├── src/bridge.ts               # 核心：平台检测 + 双协议适配
│   ├── src/data-sync/              # 数据同步中间件
│   └── src/proto-plugin/           # Vite Proto Codegen 插件
│
├── vue-web/                        # 前端示例应用（Vue 3 + Vite）
├── scripts/                        # 跨平台构建脚本
└── output/                         # 构建产物输出
```

---

## 快速开始

### 前置条件

| 工具 | 版本要求 |
|------|----------|
| Node.js | ≥ 18 |
| JDK | ≥ 21 |
| Gradle | 9.2.1（Wrapper 自带） |
| DevEco Studio | 最新版（鸿蒙构建需要） |
| Android Studio | 最新版（Android 开发） |

### 安装依赖

```bash
npm run install:all
```

### 构建全部产物

```bash
npm run build:all
```

产物输出至 `output/` 目录：

```
output/
├── android/and_web_library-release.aar    # Android SDK
├── harmony/hm_web_library.har            # 鸿蒙 SDK
└── web/mp-sdk-bridge-1.0.0.tgz           # 前端 SDK
```

### 单独构建

```bash
npm run build:proto       # 构建共享 Proto 解析器
npm run build:android     # 仅 Android
npm run build:harmony     # 仅鸿蒙（需 DEVECO_HOME 环境变量）
npm run build:web         # 仅前端 SDK
```

---

## 使用方式

### 前端 SDK

```typescript
import { bridge, setupDataSyncHandlers, waitUserInfoSync } from '@mp-sdk/bridge';
import axios from 'axios';

// 初始化数据同步
setupDataSyncHandlers();

class LoanApi {
  // 装饰器标记：此方法需要等待 userInfo 数据就绪
  @waitUserInfoSync
  async getUserProfile() {
    return axios.get('/api/user/profile');
    // 拦截器自动将 uid/ticket 注入 headers
  }
}
```

### Android SDK

```kotlin
@NeedsUserInfo
@NeedsLoanInfo
class LoanActivity : AppCompatActivity() {
    private lateinit var webView: MPBridgeWebView
    private lateinit var dataSyncHelper: MPDataSyncHelper

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        webView = MPBridgeWebView(this)
        val channels = DataSyncBindings.getChannels(this.javaClass.name)
        dataSyncHelper = MPDataSyncHelper.create(webView, channels)
        webView.loadBridgeUrl("https://your-page.com")
        dataSyncHelper.setUserInfo("""{"uid":"123","ticket":"abc"}""")
    }
}
```

### 鸿蒙 SDK

```typescript
import { JSBridgeManager, DataSyncHelper, DsBridgeProxy, BridgeUtils, DataSyncChannel } from 'hm_web_library';

// 在 Page 中使用原生 Web 组件
const bridgeManager = new JSBridgeManager(true);
const dataSyncHelper = new DataSyncHelper(bridgeManager, [DataSyncChannel.USER_INFO], true);
const dsBridgeProxy = new DsBridgeProxy(bridgeManager);

Web({ src: url, controller: controller })
  .javaScriptProxy({ object: dsBridgeProxy, name: '_dsbridge', ... })
```

---

## 数据同步流程

```
1. Native 页面创建 WebView + DataSyncHelper，设置业务数据
2. WebView 加载页面（URL 自动追加 ?platform=android|harmony）
3. 前端 SDK 自动检测平台，初始化 Bridge 连接
4. 前端发起 HTTP 请求 → 装饰器标记所需通道 → 拦截器阻塞请求
5. Native 页面加载完成 → DataSyncHelper 推送数据 → JSBridge callHandler
6. 前端 SDK 接收数据 → DataSyncManager 唤醒等待队列
7. 拦截器注入数据到请求 → HTTP 请求发出
```

---

## 扩展数据通道

新增通道只需 3 步：

1. 在 `specs/proto/channels.proto` 中添加 message：
   ```protobuf
   message OrderInfo {
     string orderId = 1;
     double amount = 2;
   }
   ```

2. 运行构建（codegen 自动生成三端代码）：
   ```bash
   npm run build:all
   ```

3. 使用自动生成的 API：
   - Android: `@NeedsOrderInfo` + `helper.setOrderInfo(data)`
   - Vue: `@waitOrderInfoSync` + `OrderInfo` 接口
   - 鸿蒙: `DataSyncChannel.ORDER_INFO` + `helper.setOrderInfo(data)`

> **无需修改任何 SDK 源码**，三端代码全自动生成。

---

## 技术栈

| 平台 | 技术 | 关键版本 |
|------|------|----------|
| Android | Kotlin + KSP + JsBridge | AGP 9.0.1, Gradle 9.2.1, Kotlin 2.2.10 |
| HarmonyOS | ArkTS + hvigor | DevEco Studio 内置 |
| Web SDK | TypeScript + Vite | Vite 5.4, TS 5.6 |
| Codegen | Protocol Buffers (Schema) | proto3, 运行时 JSON 传输 |
| 共享解析器 | TypeScript (CommonJS) | `@mp-sdk/proto-codegen` |

---

## 文档索引

| 文档 | 路径 | 说明 |
|------|------|------|
| 架构设计 | `specs/Design.md` | 完整的架构决策、模块依赖、API 参考 |
| 变更记录 | `specs/Wiki.md` | 架构演进与关键决策历史 |
| 需求规范 | `specsv2/proposal.md` | 功能需求、模块接口、任务 DAG |
| 约束规范 | `specsv2/constraints.md` | 项目/技术栈/团队约束 |
| Harness 规范 | `specsv2/harness.md` | 从需求到验收的 Harness 军团规范 |
| 能力接入 | `specsv2/capabilities.md` | MCP/Skill 接入规范 |

---

## 环境配置

### Android

```bash
# gradle.properties 关键配置
android.disallowKotlinSourceSets=false
android.sourceset.disallowProvider=false
```

### 鸿蒙

```bash
# 环境变量
export DEVECO_HOME=/path/to/DevEcoStudio
export HOS_SDK_HOME=/path/to/HarmonyOS-SDK
```

### 通用

- 构建脚本使用 Node.js，不使用 PowerShell 专有命令
- 所有构建入口统一在根目录 `package.json` 的 npm scripts

---

## License

Proprietary — 内部项目，请勿外传。
