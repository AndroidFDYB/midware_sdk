# MP-SDK 约束规范

> **SSD (Spec-Driven Development)** — 本文档定义项目、技术栈、团队三层约束，所有开发活动必须遵守。

---

## 1. 项目约束

### 1.1 工程结构约束

| 约束 | 说明 |
|------|------|
| 三端独立工程 | Android / HarmonyOS / Web SDK 各自独立工程，不共享构建系统 |
| 共享 Proto 源 | 所有数据通道定义集中在 `specs/proto/`，各端 codegen 从此生成 |
| 构建统一入口 | 根目录 `package.json` npm scripts 作为跨平台构建唯一入口 |
| 产物输出规范 | 所有构建产物输出到 `output/` 目录，按平台分子目录 |
| 不引入 PowerShell | 构建脚本禁止使用 PowerShell 专有语法，保证跨平台兼容 |

### 1.2 版本管理约束

| 约束 | 说明 |
|------|------|
| 中型改动必提交 | 每次中型改动（功能模块完成/接口变更/架构调整）必须 git commit |
| 语义化版本 | SDK 产物遵循 SemVer（Major.Minor.Patch） |
| Proto 变更联动 | Proto 文件变更必须触发三端 codegen 重新生成 |
| 分支策略 | main 为稳定分支，feature/ 分支开发后 PR 合入 |

### 1.3 文档维护约束

| 约束 | 说明 |
|------|------|
| 架构决策同步 | 每次重要架构决策需同步到 `specs/Design.md` |
| 变更记录 | 重大变更需追加到 `specs/Wiki.md` 变更记录 |
| 接口文档 | 公共 API 变更需更新 `specsv2/proposal.md` 接口定义 |
| 不生成无用文档 | 不为生成而生成，文档必须对开发有实际价值 |

### 1.4 安全约束

| 约束 | 说明 |
|------|------|
| 敏感数据不记录 | 用户凭据、密钥、Token 等严禁记录到日志或文档 |
| 数据传输加密 | 生产环境 WebView 必须使用 HTTPS |
| Proto 不含密钥 | proto 文件中不包含任何平台特定的密钥或配置 |

---

## 2. 技术栈约束

### 2.1 Android 端

| 维度 | 约束 | 版本 |
|------|------|------|
| 构建工具 | Android Gradle Plugin | 9.0.1 |
| Gradle | 构建系统 | 9.2.1 (Wrapper) |
| Kotlin | 编程语言（AGP 9.x 内置） | 2.2.10 |
| KSP | 编译期注解处理 | 2.2.10-2.0.2 |
| compileSdk | 目标编译版本 | 36 (minorApiLevel=1) |
| minSdk | 最低支持版本 | 24 |
| JVM Target | Java 目标版本 | 21 |
| JsBridge | 桥接库 | happydog-intj/JsBridge（本地源码集成） |
| JSON 序列化 | 数据序列化 | Gson 2.10.1 |

**禁止项**：
- ❌ 不使用 JitPack 远程依赖（不稳定）
- ❌ 不使用 KAPT（性能差，不支持增量编译）
- ❌ 不使用运行时反射（混淆环境不安全）
- ❌ `MPBridgeWebView` 不允许继承（final 类）
- ❌ JavaExec 任务不直接引用其他项目 `sourceSets.runtimeClasspath`（Gradle 9.x 独占锁限制）

**跨项目 JavaExec classpath 规范**：
```kotlin
// 必须通过本地 resolvable configuration + dependencies 声明
val codegenClasspath: Configuration by configurations.creating {
    isCanBeConsumed = false
    isCanBeResolved = true
}
dependencies { codegenClasspath(project(":proto-codegen")) }
// JavaExec task: classpath = codegenClasspath
```

**关键配置**：
```properties
# gradle.properties
android.disallowKotlinSourceSets=false    # KSP 兼容 AGP 9.x
android.sourceset.disallowProvider=false  # Provider 进 SourceSet
```

**Kotlin 扩展函数导入规范**：
- Proto codegen 生成的 setter（`setUserInfo` / `setLoanInfo` / `setVipInfo`）为顶层扩展函数，调用方需显式导入
- 与 Jetpack Compose 的 `remember` / `mutableStateOf` 使用方式一致，这是 Kotlin 标准模式
- 可选方式：逐个导入 `import com.sharknade.and_web_library.setUserInfo` 或通配导入 `import com.sharknade.and_web_library.*`
- 零导入替代：`helper.setData(DataSyncChannel.USER_INFO, data)`（`setData` 为成员函数）

### 2.2 鸿蒙端

| 维度 | 约束 |
|------|------|
| 开发工具 | DevEco Studio（内置 node + hvigor） |
| 编程语言 | ArkTS |
| Web 组件 | 鸿蒙原生 Web 组件 |
| 注入机制 | `javaScriptProxy` |
| 构建系统 | hvigor（鸿蒙专用） |

**禁止项**：
- ❌ 不依赖系统 node（使用 DevEco 内置）
- ❌ 不封装隐藏原生 Web 组件（保持灵活性）

**环境变量**：
```bash
DEVECO_HOME    # DevEco Studio 安装路径
HOS_SDK_HOME   # 鸿蒙 SDK 路径
```

### 2.3 前端 SDK

| 维度 | 约束 | 版本 |
|------|------|------|
| 构建工具 | Vite（库模式） | ^5.4.21 |
| 编程语言 | TypeScript | ~5.6.0 |
| 输出格式 | ESM + CJS | 双格式 |
| 运行时依赖 | 零依赖 | 无 |
| HTTP 客户端 | Axios（peerDependency） | 由消费方提供 |

**禁止项**：
- ❌ 不依赖 `protobuf.js`（Proto 仅作 Schema）
- ❌ 不依赖 `dsbridge` npm 包（内部实现适配）
- ❌ 不包含业务逻辑（SDK 只提供机制）

**Vite 配置约束**：
```typescript
// vite.config.ts 关键配置
{
  build: {
    lib: { formats: ['es', 'cjs'] },
    rollupOptions: {
      external: ['axios']  // axios 外部化
    }
  }
}
```

### 2.4 Proto 约束

| 约束 | 说明 |
|------|------|
| 语法版本 | proto3 |
| 传输格式 | JSON 字符串（非 protobuf binary） |
| 字段类型 | 仅标量（string/int32/int64/double/bool）+ repeated |
| 禁止特性 | 嵌套 message、enum、oneof（保持解析器简单） |
| 字段编号 | 从 1 开始连续递增 |
| 命名规则 | Message 名 PascalCase，字段名 camelCase |

### 2.5 共享依赖

| 依赖 | 用途 | 版本 |
|------|------|------|
| `@mp-sdk/proto-codegen` | 共享 Proto 解析器（file:specs/proto-codegen） | 1.0.0 |
| Node.js | 构建脚本运行环境 | ≥ 18 |

---

## 3. 团队约束

### 3.1 协作规范

| 规范 | 说明 |
|------|------|
| 提交信息 | 格式：`[模块] 动作: 简要描述`，如 `[android] feat: 新增 KSP 处理器` |
| PR 审查 | 涉及公共 API 变更必须经过代码审查 |
| 代码风格 | 各端遵循各自平台的标准代码风格 |
| 测试要求 | 核心功能必须有单元测试，构建流程集成测试 |

### 3.2 SubAgent 使用规范

| 规范 | 说明 |
|------|------|
| 职责边界 | PM Agent 负责任务拆分与调度，SubAgent 负责具体实现 |
| 结果回传 | SubAgent 只回传必要结果（状态 + 关键摘要），不回传完整代码 |
| 文件传递 | 大量信息通过文件（git diff / 产物路径）传递 |
| 并行度控制 | 最大并行 SubAgent 数量根据任务依赖图动态决定（参考 DAG） |
| 失败处理 | SubAgent 失败时回传错误详情，PM 决定重试策略 |
| 上下文保护 | 避免 SubAgent 回传内容撑爆主 Agent 上下文 |

### 3.3 沟通规范

| 规范 | 说明 |
|------|------|
| 决策类型 | 仅功能和业务决策需人工确认，技术决策 Agent 自主完成 |
| 权限原则 | 非极度敏感权限操作不需要人工确认 |
| 问题形式 | Agent 可通过一对一采访形式澄清需求，每次只问一个问题 |
| 文档同步 | 需求理解和技术方案需实时更新到对应 Markdown 文档 |

### 3.4 交付标准

| 标准 | 说明 |
|------|------|
| **构建验证通过** | **代码修改后必须执行构建命令，确认 BUILD SUCCESSFUL（强制门禁）** |
| 可构建 | `npm run build:all` 无错误 |
| 可运行 | 各端示例应用可正常启动并演示数据同步 |
| 可验证 | Proto 变更 → codegen → 三端代码正确生成 |
| 可集成 | SDK 产物可被业务方工程正确引入 |
| 文档完整 | 架构、接口、使用说明与代码保持一致 |

> **禁止行为**：代码修改后未执行构建验证就标记任务完成。SubAgent 回传 SUCCESS 前，Test SubAgent 必须执行对应构建命令验证。

---

## 4. 约束违反处理

| 级别 | 处理方式 |
|------|----------|
| **阻断级** | 违反项目结构约束、Proto 约束 → 立即修复 |
| **警告级** | 违反文档规范、提交信息格式 → 下次提交时修复 |
| **建议级** | 代码风格不一致 → 建议优化，不强制 |

---

## 5. 约束变更流程

1. 提出约束变更请求（说明理由）
2. 评估影响范围（哪些模块受影响）
3. 更新本文档
4. 通知相关开发方
5. 执行必要的代码调整
