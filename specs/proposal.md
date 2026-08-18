# MP-SDK 需求规范与任务编排

> **SSD (Spec-Driven Development)** — 本文档是项目的需求真相源，定义功能需求、模块接口、任务拆分与执行依赖（DAG）。

---

## 1. 需求概述

### 1.1 业务背景

金融/会员业务场景中，WebView 容器承载的前端页面需要从 Native 端获取大量业务数据（用户认证信息、借款信息、会员信息等）。直接通过 URL 参数传递存在安全风险和数据量限制，需要通过 JSBridge 进行安全、大容量的数据传递。

### 1.2 核心问题

**时序不确定性**：前端页面加载后立即发起 HTTP 请求，但 Native 端的业务数据可能尚未就绪。需要一套等待唤醒机制，让请求自动阻塞直到数据到达。

### 1.3 需求目标

| 目标 | 说明 |
|------|------|
| 跨平台统一 | 一套 Proto 定义驱动三端代码生成 |
| 零侵入集成 | SDK 提供机制，业务方按需引入 |
| 类型安全 | 编译期检查，无运行时反射 |
| 横向扩展 | 新增通道只需添加 Proto Message |
| 开发者友好 | 装饰器/注解模式，IDE 自动补全 |

---

## 2. 功能模块

### 2.1 模块总览

```
MP-SDK
├── M1: Proto 驱动 Codegen 引擎
├── M2: 前端 Bridge SDK（零运行时依赖）
├── M3: 前端数据同步中间件（等待唤醒）
├── M4: Android JSBridge SDK
├── M5: Android 数据同步模块（组合 + KSP）
├── M6: 鸿蒙 JSBridge SDK
├── M7: 鸿蒙数据同步模块（工具注入）
├── M8: 构建与发布体系
└── M9: 示例工程与文档
```

### 2.2 M1: Proto 驱动 Codegen 引擎

**职责**：以 Protocol Buffers `.proto` 文件为唯一真相源，解析并生成各端所需代码。

**输入**：`specs/proto/channels.proto` + `specs/proto/custom/*.proto`

**输出**：
- Android: 注解、通道常量、方法映射、setter、channel-mappings.json
- Vue: TypeScript 接口、装饰器、通道配置、Handler 注册函数
- 鸿蒙: 通道常量、方法映射、setter

**关键规则**：
- 命名约定推导，零额外配置
- 仅使用 message + 标量字段 + repeated
- 集成方通过 `specs/proto/custom/` 扩展

### 2.3 M2: 前端 Bridge SDK

**职责**：提供统一的跨平台 JSBridge 通信 API，自动检测运行环境。

**平台检测顺序**：
1. `window.WebViewJavascriptBridge` → Android
2. `window.__harmony_bridge` + `window.dsBridge` → 鸿蒙
3. 默认 → 纯 Web

### 2.4 M3: 前端数据同步中间件

**职责**：解决 Native→Web 数据传递的时序问题，请求自动阻塞直到数据就绪。

**三层架构**：
| 层 | 职责 |
|---|---|
| DataSyncManager | 多通道队列管理、数据缓存、超时控制 |
| Axios 拦截器 | 请求拦截、数据注入（headers/params/body） |
| 装饰器 | 标记 API 方法所需数据通道 |

### 2.5 M4: Android JSBridge SDK

**职责**：基于 JsBridge 封装 WebView 双向通信，提供 Kotlin 友好 API。

**设计原则**：
- final 类，禁止继承
- 组合模式，非继承
- 编译期注解处理（KSP），无运行时反射

### 2.6 M5: Android 数据同步模块

**职责**：管理数据通道状态，页面就绪时自动推送数据。

**两阶段流水线**：
- Stage 1: Gradle ProtoCodegenTask → 生成注解/常量/setter
- Stage 2: KSP DataSyncSymbolProcessor → 扫描注解生成 DataSyncBindings

### 2.7 M6: 鸿蒙 JSBridge SDK

**职责**：基于鸿蒙原生 Web 组件的 `javaScriptProxy` 注入机制实现桥接。

**设计原则**：
- 低侵入工具注入
- 页面直接使用原生 Web 组件
- DsBridgeProxy + BridgeUtils 独立导出

### 2.8 M7: 鸿蒙数据同步模块

**职责**：与 Android M5 对等的数据同步功能，不使用注解，构造注入通道列表。

### 2.9 M8: 构建与发布体系

**职责**：统一的跨平台构建入口，产出三端 SDK 制品。

**构建命令**：
```
npm run build:proto       # Proto 解析器
npm run build:android     # AAR
npm run build:harmony     # HAR
npm run build:web         # TGZ
npm run build:all         # 全部
```

### 2.10 M9: 示例工程与文档

**职责**：提供各端集成示例，验证 SDK 功能完整性。

---

## 3. 模块接口定义

### 3.1 M2 接口：前端 Bridge API

```typescript
interface MPBridge {
  // 平台检测
  getPlatform(): 'android' | 'harmony' | 'web';
  hasNativeBridge(): boolean;
  hasMethod(method: string): boolean;

  // 调用 Native
  call(method: string, params?: any): any;           // 同步（仅鸿蒙）
  callAsync(method: string, params?: any): Promise<any>; // 异步

  // 注册 Handler
  register(method: string, handler: (params: any) => any): void;
  registerAsyn(method: string, handler: (params: any, complete: (result: any) => void) => void): void;
}
```

### 3.2 M3 接口：数据同步 API

```typescript
// 初始化
function setupDataSyncHandlers(): void;

// 通道注册
function registerChannel(name: string, config: ChannelConfig): void;

// 装饰器（自动生成）
function waitUserInfoSync(target: any, key: string, descriptor: PropertyDescriptor): PropertyDescriptor;
function waitLoanInfoSync(target: any, key: string, descriptor: PropertyDescriptor): PropertyDescriptor;
function waitVipInfoSync(target: any, key: string, descriptor: PropertyDescriptor): PropertyDescriptor;

// 管理器
interface DataSyncManager {
  pushData(channel: string, data: any): void;
  waitForData(channel: string, timeout?: number): Promise<any>;
  isDataReady(channel: string): boolean;
  reset(): void;
}
```

### 3.3 M4/M5 接口：Android SDK API

```kotlin
// MPBridgeWebView（final 类）
class MPBridgeWebView(context: Context) : BridgeWebView(context) {
    fun registerBridgeHandler(methodName: String, handler: (String, OnBridgeCallback) -> Unit)
    fun callBridgeHandler(methodName: String, data: String?, callback: OnBridgeCallback?)
    fun loadBridgeUrl(url: String)  // 自动追加 ?platform=android
}

// MPDataSyncHelper（组合模式）
object MPDataSyncHelper {
    fun create(webView: BridgeWebView, channels: Set<String>): MPDataSyncHelper
}
class MPDataSyncHelper {
    fun setData(channel: String, data: String)
    fun notifyPageLoaded()
    fun notifyPageLoading()
    fun isAllDataSynced(): Boolean
    fun reset()
    // setter 由 codegen 生成为扩展函数
}

// KSP 生成的注册表
object DataSyncBindings {
    fun getChannels(className: String): Set<String>
}

// 注解（codegen 生成）
@NeedsUserInfo
@NeedsLoanInfo
@NeedsVipInfo
@NeedsDataSync(channel: String)  // 通用注解
```

### 3.4 M6/M7 接口：鸿蒙 SDK API

```typescript
// JSBridgeManager
class JSBridgeManager {
  constructor(debug?: boolean)
  registerHandler(method: string, handler: SyncBridgeHandler): void
  registerAsyncHandler(method: string, handler: AsyncBridgeHandler): void
  callJs(method: string, args?: Object[], callback?: (result: string) => void): void
  setWebController(controller: webview.WebviewController): void
}

// DataSyncHelper
class DataSyncHelper {
  constructor(bridgeManager: JSBridgeManager, requiredChannels: string[], debug?: boolean)
  setData(channel: string, data: string): void
  notifyPageLoaded(): void
  notifyPageLoading(): void
  isAllDataSynced(): boolean
}

// 工具类
class BridgeUtils {
  static appendPlatformParam(url: string): string
  static injectBridgeJs(controller: webview.WebviewController, context: Context): void
}

class DsBridgeProxy {
  constructor(bridgeManager: JSBridgeManager)
  call(requestJson: string): string
  callAsync(requestJson: string): string
  hasMethod(method: string): boolean
  onNativeCallComplete(callbackId: string, result: string): void
}
```

### 3.5 M1 接口：Proto Codegen

```typescript
// 共享解析器 API（@mp-sdk/proto-codegen）
interface ProtoFile {
  messages: ProtoMessage[];
}
interface ProtoMessage {
  name: string;       // PascalCase
  fields: ProtoField[];
}
interface ProtoField {
  name: string;
  type: string;
  number: number;
  repeated: boolean;
}

// 命名推导
function toChannelName(messageName: string): string;       // PascalCase → camelCase
function toSyncMethod(messageName: string): string;         // → sync + PascalCase
function toAnnotation(messageName: string): string;         // → @Needs + PascalCase
function toDecorator(messageName: string): string;          // → @wait + PascalCase + Sync
function toConstant(messageName: string): string;           // → UPPER_SNAKE_CASE
```

---

## 4. 任务拆分与 DAG

> 以下任务拆分为 **大模型可解析的 DAG 格式**。每个任务有唯一 ID、目标描述、上下游依赖。
> 执行时可根据并行度开启多个 SubAgent。

### 4.1 任务清单

#### T1: Proto Schema 设计与验证

| 属性 | 值 |
|------|------|
| **ID** | `T1` |
| **模块** | M1 |
| **目标** | 设计 `channels.proto` 标准通道定义，验证解析器正确性 |
| **输入** | 业务需求（UserInfo/LoanInfo/VipInfo 数据结构） |
| **输出** | `specs/proto/channels.proto` 文件，解析器单元测试通过 |
| **上游依赖** | 无（起点任务） |
| **下游依赖** | T2, T3, T4 |
| **验收标准** | proto 文件格式合法，三端解析器均能正确解析。**验证命令：`npm run build:proto`** |

---

#### T2: 共享 Proto 解析器实现

| 属性 | 值 |
|------|------|
| **ID** | `T2` |
| **模块** | M1 |
| **目标** | 实现 `@mp-sdk/proto-codegen` TypeScript 轻量级解析器 |
| **输入** | `specs/proto/channels.proto` |
| **输出** | `specs/proto-codegen/src/` 下 parser.ts, naming.ts, model.ts, index.ts |
| **上游依赖** | T1 |
| **下游依赖** | T5, T7, T8 |
| **验收标准** | 能正确解析 message/field/repeated，命名推导符合约定。**验证命令：`npm run build:proto` 成功** |

---

#### T3: Android Proto Codegen 实现

| 属性 | 值 |
|------|------|
| **ID** | `T3` |
| **模块** | M1, M5 |
| **目标** | 实现 Android 端 Kotlin 版 Proto 解析器 + 代码生成器 |
| **输入** | `specs/proto/channels.proto` |
| **输出** | `android/proto-codegen/` 下 Main.kt, ProtoParser.kt, CodeGenerators.kt, NamingConventions.kt |
| **上游依赖** | T1 |
| **下游依赖** | T6 |
| **验收标准** | 生成注解、通道常量、方法映射、setter、channel-mappings.json 均正确。**验证命令：`cd android; .\gradlew.bat :and_web_library:assembleDebug` BUILD SUCCESSFUL + protoCodegen 生成 5 个文件** |

---

#### T4: 前端 SDK Bridge 核心实现

| 属性 | 值 |
|------|------|
| **ID** | `T4` |
| **模块** | M2 |
| **目标** | 实现跨平台 Bridge API（平台检测 + 双协议适配） |
| **输入** | 通信协议规范（Android WebViewJavascriptBridge + 鸿蒙 dsBridge） |
| **输出** | `vue-web-sdk/src/bridge.ts`, `types.ts`, `platform.ts`, `index.ts` |
| **上游依赖** | T1 |
| **下游依赖** | T5 |
| **验收标准** | 三端环境自动检测正确，callAsync/register 等 API 可用 |

---

#### T5: 前端数据同步中间件实现

| 属性 | 值 |
|------|------|
| **ID** | `T5` |
| **模块** | M3 |
| **目标** | 实现 DataSyncManager + Axios 拦截器 + 装饰器三层架构 |
| **输入** | 数据同步需求（等待唤醒机制） |
| **输出** | `vue-web-sdk/src/data-sync/` 下 manager.ts, interceptor.ts, decorators.ts, types.ts, index.ts |
| **上游依赖** | T2, T4 |
| **下游依赖** | T9 |
| **验收标准** | 装饰器标记的方法请求被正确阻塞，数据到达后自动释放 |

---

#### T6: Android SDK + KSP 注入实现

| 属性 | 值 |
|------|------|
| **ID** | `T6` |
| **模块** | M4, M5 |
| **目标** | 实现 MPBridgeWebView(final) + MPDataSyncHelper(组合) + KSP Processor + ProtoCodegenTask |
| **输入** | Android 架构设计（组合模式 + KSP 编译期注入） |
| **输出** | and_web_library/ + data-sync-processor/ 全部源码 |
| **上游依赖** | T3 |
| **下游依赖** | T9 |
| **验收标准** | Gradle 构建成功，KSP 正确生成 DataSyncBindings，无运行时反射。**验证命令：`cd android; .\gradlew.bat :and_web_library:assembleDebug` BUILD SUCCESSFUL + 检查 DataSyncBindings.kt 内容** |

---

#### T7: 鸿蒙 JSBridge SDK 实现

| 属性 | 值 |
|------|------|
| **ID** | `T7` |
| **模块** | M6 |
| **目标** | 实现 JSBridgeManager + DsBridgeProxy + BridgeUtils + bridge.js |
| **输入** | 鸿蒙 Web 组件 javaScriptProxy 机制 |
| **输出** | `hm/hm_web_library/src/main/ets/bridge/` 全部源码 + rawfile/bridge.js |
| **上游依赖** | T2 |
| **下游依赖** | T8, T9 |
| **验收标准** | dsBridge 兼容协议通信正常，sync/async 调用均可 |

---

#### T8: 鸿蒙数据同步 + Codegen 实现

| 属性 | 值 |
|------|------|
| **ID** | `T8` |
| **模块** | M7 |
| **目标** | 实现 DataSyncHelper + Proto Codegen 脚本 + generated/ 产物 |
| **输入** | 鸿蒙数据同步需求 + Proto 文件 |
| **输出** | DataSyncHelper.ets + generated/*.ets + proto-codegen-harmony.js |
| **上游依赖** | T2, T7 |
| **下游依赖** | T9 |
| **验收标准** | 数据推送/状态管理正常，生成产物与 proto 一致。**验证命令：`npm run build:harmony` BUILD SUCCESSFUL + 检查 generated/*.ets** |

---

#### T9: 构建体系与示例工程

| 属性 | 值 |
|------|------|
| **ID** | `T9` |
| **模块** | M8, M9 |
| **目标** | 统一构建脚本、产物收集、示例应用验证 |
| **输入** | 各端 SDK 源码 |
| **输出** | scripts/ + output/ + vue-web/ + android/app/ |
| **上游依赖** | T5, T6, T8 |
| **下游依赖** | T10 |
| **验收标准** | `npm run build:all` 成功，三端示例可运行。**构建验证（强制）：Android BUILD SUCCESSFUL + 鸿蒙 BUILD SUCCESSFUL + 前端无错误 + output/ 产物完整** |

---

#### T10: 集成测试与文档完善

| 属性 | 值 |
|------|------|
| **ID** | `T10` |
| **模块** | M9 |
| **目标** | 端到端集成验证、文档更新、README 同步 |
| **输入** | 全部 SDK 产物 |
| **输出** | 更新的 Design.md, Wiki.md, README.md |
| **上游依赖** | T9 |
| **下游依赖** | 无（终点任务） |
| **验收标准** | 三端集成示例可运行，文档与代码一致。**验证命令：`npm run build:all` 全量通过 + 产物检查 + 文档检查** |

---

### 4.2 DAG 依赖图

```
T1 (Proto Schema)
├──→ T2 (共享解析器)
│    ├──→ T5 (前端中间件) ──┐
│    ├──→ T7 (鸿蒙Bridge) ──┤
│    │    └──→ T8 (鸿蒙数据同步) ──┤
│    │                              │
│    └──────────────────────────────┤
│                                   │
├──→ T3 (Android Codegen)          │
│    └──→ T6 (Android SDK+KSP) ────┤
│                                   │
└──→ T4 (前端Bridge) ──────────────┤
     └──→ T5 (前端中间件) ─────────┤
                                    │
                                    ▼
                              T9 (构建+示例)
                                    │
                                    ▼
                              T10 (测试+文档)
```

### 4.3 并行执行策略

> **构建验证强制规则**：每个任务完成后，必须执行对应构建命令验证（详见 [harness.md §2.4.0](harness.md) 构建验证门禁）。未通过构建验证的任务不允许标记完成。

| 阶段 | 可并行任务 | SubAgent 数量 |
|------|-----------|---------------|
| Phase 1 | T1 | 1 |
| Phase 2 | T2, T3, T4 | 3 (并行) |
| Phase 3 | T5, T6, T7 | 3 (并行) |
| Phase 4 | T8 | 1 (等待 T7) |
| Phase 5 | T9 | 1 |
| Phase 6 | T10 | 1 |

> **最大并行度**: 3 个 SubAgent（Phase 2/3），可根据资源动态调整。

### 4.4 SubAgent 调度规则

1. **结果回传**：SubAgent 只回传任务状态（成功/失败）+ 关键产出摘要
2. **文件传递**：大量代码/配置变更通过 git diff 或文件路径传递，不回传完整内容
3. **验收检查**：每个 Phase 结束后，PM Agent 检查产出是否符合验收标准
4. **失败重试**：任务失败时，SubAgent 回传错误信息，PM 决定是否重试或调整依赖

---

## 5. 变更管理

### 5.1 Proto 变更流程

1. 修改 `specs/proto/channels.proto`
2. 运行 `npm run build:proto` 重建解析器
3. 运行 `npm run build:all` 触发三端 codegen
4. 验证生成产物正确性
5. 提交 git

### 5.2 接口变更流程

1. 更新本文档第 3 节接口定义
2. 创建对应任务（参照第 4 节模板）
3. 按 DAG 执行变更任务
4. 更新 Design.md 对应章节

---

## 附录: Proto 命名约定速查表

| 元素 | 规则 | 示例 |
|------|------|------|
| Proto Message | PascalCase | `UserInfo` |
| 通道名 (Channel) | camelCase | `userInfo` |
| JSBridge 方法名 | `sync` + PascalCase | `syncUserInfo` |
| Android 注解 | `@Needs` + PascalCase | `@NeedsUserInfo` |
| Vue 装饰器 | `@wait` + PascalCase + `Sync` | `@waitUserInfoSync` |
| Android Setter | `set` + PascalCase | `setUserInfo` |
| 鸿蒙通道常量 | UPPER_SNAKE_CASE | `USER_INFO` |
| TypeScript 接口 | PascalCase | `UserInfo` |
