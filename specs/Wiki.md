# MP-SDK Wiki — 架构变更记录

> 本文档记录 MP-SDK 项目的架构演进、关键决策与变更历史，便于团队成员快速了解设计背景。

---

## 2025-08 架构重构：组合模式 + KSP 注入 + 鸿蒙原生 Web

### 背景

原有架构中，Android 端采用 **继承模式**（`MPBridgeWebView` 声明为 `open class`，业务方继承后在子类上标注 `@NeedsUserInfo` 等注解，运行时反射读取），存在以下问题：

1. `open class` 破坏了封装性，业务方可以覆盖 SDK 内部方法
2. 运行时反射有性能开销，且在混淆/裁剪环境下可能失效
3. 鸿蒙端 `MPBridgeWeb` 封装组件隐藏了原生 `Web` 组件细节，灵活性差

### 变更内容

#### Android 端：禁止继承，改用组合 + KSP 编译期注入

**核心改动：**

| 项目 | 变更前 | 变更后 |
|------|--------|--------|
| `MPBridgeWebView` | `open class`，可被继承 | `class`（final），禁止继承 |
| 数据同步集成 | 内置于 `MPBridgeWebView`（`getDataSyncHelper()` 等） | 移除，由 Activity 组合持有 `MPDataSyncHelper` |
| 通道检测 | 运行时反射读取注解 | KSP 编译期扫描注解，生成 `DataSyncBindings` 注册表 |
| `MPDataSyncHelper` 构造 | `create(webView: MPBridgeWebView)` 内部反射 | `create(webView: BridgeWebView, channels: Set<String>)` 构造注入 |
| 业务使用方式 | 继承 `MPBridgeWebView` 标注注解 | Activity 持有 `MPBridgeWebView` + `MPDataSyncHelper`，通过 `DataSyncBindings.getChannels()` 查表 |

**新增模块：`data-sync-processor`**

- 纯 Kotlin/JVM 模块，不依赖 Android SDK
- 实现 `SymbolProcessor` 接口，编译期扫描四种注解
- 通过 SPI（`META-INF/services/...SymbolProcessorProvider`）自动注册
- 生成 `DataSyncBindings.kt`：类全限定名 → 通道集合的 `when` 表达式

**关键文件：**

| 文件 | 说明 |
|------|------|
| `android/data-sync-processor/build.gradle.kts` | KSP 模块构建配置 |
| `android/data-sync-processor/.../DataSyncSymbolProcessor.kt` | 核心处理器，`resolver.getSymbolsWithAnnotation()` 扫描注解 |
| `android/data-sync-processor/.../DataSyncSymbolProcessorProvider.kt` | KSP Provider |
| `android/data-sync-processor/.../META-INF/services/...SymbolProcessorProvider` | SPI 注册文件 |

**构建配置变更：**

| 文件 | 变更 |
|------|------|
| `gradle/libs.versions.toml` | 新增 `ksp = "2.2.10-2.0.2"` 版本和插件声明 |
| `settings.gradle.kts` | 新增 `include(":data-sync-processor")` |
| `app/build.gradle.kts` | 新增 `alias(libs.plugins.ksp)` + `ksp(project(":data-sync-processor"))` |
| `gradle.properties` | 新增 `android.disallowKotlinSourceSets=false`（KSP 兼容 AGP 9.x 内置 Kotlin） |

**KSP 生成示例：**

```kotlin
// 由 data-sync-processor 自动生成
object DataSyncBindings {
    fun getChannels(className: String): Set<String> = when (className) {
        "com.sharknade.myapplication.webview.DataSyncDemoActivity" -> setOf("loanInfo", "userInfo")
        else -> emptySet()
    }
}
```

#### 鸿蒙端：原生 Web 组件 + 工具注入

**核心改动：**

| 项目 | 变更前 | 变更后 |
|------|--------|--------|
| 页面组件 | `MPBridgeWeb` 封装组件 | 原生 `Web` 组件 |
| 桥接逻辑 | 内置于 `MPBridgeWeb` | 提取为 `BridgeUtils` 静态工具类 |
| javaScriptProxy | 内联在 `MPBridgeWeb` 中 | 提取为 `DsBridgeProxy` 独立导出类 |
| 平台参数 | `MPBridgeWeb` 内部处理 | `BridgeUtils.appendPlatformParam()` |
| JS 注入 | `MPBridgeWeb` 内部处理 | `BridgeUtils.injectBridgeJs()` |

**新增文件：**

| 文件 | 说明 |
|------|------|
| `hm/hm_web_library/src/main/ets/bridge/DsBridgeProxy.ets` | `javaScriptProxy` 注入对象，实现 `call`/`callAsync`/`hasMethod`/`onNativeCallComplete` |
| `hm/hm_web_library/src/main/ets/bridge/BridgeUtils.ets` | 静态工具类，`appendPlatformParam` + `injectBridgeJs` |

**导出变更：**

`hm/hm_web_library/Index.ets` 新增导出：
```typescript
export { DsBridgeProxy } from './src/main/ets/bridge/DsBridgeProxy';
export { BridgeUtils } from './src/main/ets/bridge/BridgeUtils';
```

**`MPBridgeWeb` 保留为可选便捷组件**，内部委托给 `BridgeUtils` 和 `DsBridgeProxy`，不再包含内联逻辑。

### 技术决策与理由

#### 为什么选择 KSP 而非 KAPT？

- KAPT 不支持增量编译，且依赖 Java 注解处理（APT），性能差
- KSP 是 Kotlin 原生的符号处理 API，支持增量编译
- KSP2 模式下支持 K2 编译器，与 AGP 9.x 内置 Kotlin 2.2.10 兼容

#### 为什么 `data-sync-processor` 用纯 Kotlin/JVM 模块？

- KSP 处理器不需要 Android 运行时，纯 JVM 模块足够
- 纯 JVM 模块构建更快，依赖更少
- 避免与 AGP 内置 Kotlin 插件冲突

#### 为什么 `MPBridgeWebView` 改为 final？

- 防止业务方覆盖 `registerBridgeHandler` / `callBridgeHandler` 等核心方法
- 数据同步逻辑不再内置于 WebView，降低类职责
- Activity 通过组合方式持有 WebView，更灵活

### AGP 9.x + KSP 兼容性

AGP 9.0.1 内置 Kotlin 2.2.10 编译器，与 KSP 集成时遇到以下问题及解决方案：

| 问题 | 原因 | 解决方案 |
|------|------|----------|
| `Cannot add extension with name 'kotlin'` | AGP 9.x 已内置 Kotlin 插件，不能重复应用 `kotlin-android` | 不应用 `kotlin-android`，使用 AGP 内置 |
| `ksp-2.0.21-1.0.27 is too old for kotlin-2.2.10` | KSP 版本不匹配 Kotlin 编译器 | 使用 `2.2.10-2.0.2`（KSP2 格式：`{kotlin-version}-2.0.{patch}`） |
| `Using kotlin.sourceSets DSL is not allowed` | AGP 9.x 内置 Kotlin 不允许 KSP 使用 sourceSets DSL | `gradle.properties` 添加 `android.disallowKotlinSourceSets=false` |
| `plugin already on classpath with unknown version` | Kotlin JVM 插件已在全局 classpath | `id("org.jetbrains.kotlin.jvm")` 不带版本号 |
| `Inconsistent JVM-target: compileJava(11) vs compileKotlin(21)` | Java 和 Kotlin JVM target 不一致 | 统一使用 `JavaVersion.VERSION_21` |
| `Resolution of configuration was attempted without an exclusive lock` | Gradle 9.x 禁止执行阶段直接解析其他项目 runtimeClasspath | 在消费方创建 resolvable configuration + `dependencies` 声明引用（详见 Design.md §2.12） |

### 删除的文件

| 文件 | 原因 |
|------|------|
| `android/app/.../WebViewForLoan.kt` | 继承模式子类，已被组合模式 Activity 替代 |
| `android/app/.../WebViewForVip.kt` | 同上 |
| `android/app/.../WebViewForThird.kt` | 同上 |

### 验证结果

- ✅ Android 编译成功（`BUILD SUCCESSFUL`），KSP 正确生成 `DataSyncBindings.kt`
- ✅ 鸿蒙编译成功（`BUILD SUCCESSFUL`，`CompileArkTS` 通过）
- ✅ 三端代码全部就位

---

## 2026-08 流程改进：集成测试验证阶段补齐

### 背景

在修复鸿蒙构建问题（生成代码缺少 import + `DataSyncSetters` 调用不存在的 `setData`）时发现：**SubAgent 完成代码修改后直接标记任务完成，未执行构建命令验证修改是否正确**。导致错误代码进入下一阶段，增加了调试成本。

### 问题

| 问题 | 影响 |
|------|------|
| 代码修改后未执行构建验证 | 错误代码流入下游任务，串联失败 |
| 缺少“开发完成”的统一标准 | SubAgent 主观判断完成状态，不可靠 |
| 缺少 shell 执行的强制要求 | 生成代码缺少 import 等编译期问题未被发现 |

### 改进措施

1. **新增集成测试验证标准**（Design.md §8.5）：每次代码变更后必须执行构建命令
2. **强化 Harness Phase 4**（harness.md）：Test SubAgent 必须实际执行 shell 命令验证
3. **新增交付标准约束**（constraints.md）：未通过构建验证的任务不允许标记完成
4. **DAG 任务验收标准补充**（proposal.md）：每个任务的验收标准包含构建命令执行

### 核心原则

> **代码修改未通过构建验证不算完成。** SubAgent 完成代码变更后，必须执行对应的构建命令，确认 `BUILD SUCCESSFUL` 后才能回传任务完成状态。

### 设计模式对照

```
变更前（继承模式）：
  Activity
    └── WebViewForLoan extends MPBridgeWebView
          └── @NeedsUserInfo @NeedsLoanInfo
          └── 运行时反射读取注解 → 确定通道
          └── getDataSyncHelper() 内置懒加载

变更后（组合模式 + KSP）：
  @NeedsUserInfo @NeedsLoanInfo
  Activity
    ├── MPBridgeWebView (final, 组合持有)
    ├── MPDataSyncHelper (create(webView, channels) 构造注入)
    └── DataSyncBindings.getChannels(class.name) (KSP 编译期生成)
```

---

## 历史架构决策索引

| 日期 | 主题 | Design.md 章节 |
|------|------|----------------|
| 初始 | Android JsBridge 选型 | 2.1 |
| 初始 | 鸿蒙 JSBridge 实现 | 2.2 |
| 初始 | 前端 SDK 零依赖设计 | 2.3 |
| 初始 | 构建脚本跨平台 | 2.4 |
| 初始 | AGP 9.x 适配 | 2.5 |
| 2025-08 | Android 组合模式 + KSP 编译期注入 | 2.6 |
| 2025-08 | 鸿蒙原生 Web 组件 + 工具注入 | 2.7 |
| 2026-08 | Gradle 9.x 跨项目 JavaExec 配置解析独占锁修复 | 2.12 |
| 2026-08 | Kotlin 扩展函数显式导入规范 | 2.13 |
| 2026-08 | 集成测试验证阶段补齐（开发完成标准） | 8.5 |
