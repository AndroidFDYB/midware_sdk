# MP-SDK Harness 军团规范

> **SSD (Spec-Driven Development)** — 从需求到验收的全生命周期管控规范。
> Harness = 驾驭（需求）+ 检验（产出）+ 交付（成果）的工程方法论。

---

## 1. Harness 核心理念

### 1.1 定义

Harness 是一种 **从需求到验收** 的工程管控体系。PM Agent 作为指挥官，通过 SubAgent 军团执行任务，每个阶段都有明确的验收标准和测试验证机制。

### 1.2 流程总览

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   需求分析   │───→│   任务编排   │───→│   执行实现   │───→│   验收测试   │
│  (PM Agent) │    │ (DAG 拆分)  │    │ (SubAgents) │    │(Test Agent) │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
      │                  │                   │                  │
      ▼                  ▼                   ▼                  ▼
 proposal.md        DAG 依赖图          代码产物          测试报告
 (需求真相源)       (并行执行策略)      (各端 SDK)        (通过/失败/阻塞)
```

### 1.3 角色定义

| 角色 | 职责 | 工具 |
|------|------|------|
| **PM Agent** | 需求解读、任务拆分、调度编排、验收判断 | TodoWrite、Agent(Search)、直接对话 |
| **Implement SubAgent** | 代码实现、重构、Bug 修复 | Write、SearchReplace、Bash |
| **Test SubAgent** | 编写测试、运行测试、生成测试报告 | Bash、Read、Write |
| **Review SubAgent** | 代码审查、架构合规检查 | CodeReview、Read |
| **Search SubAgent** | 信息收集、依赖分析、影响评估 | 全局搜索、记忆检索 |

---

## 2. 阶段规范

### 2.1 Phase 1: 需求分析

**执行者**：PM Agent（主 Agent）

**输入**：用户原始需求描述
**输出**：`specsv2/proposal.md` 更新

**步骤**：
1. 解读用户需求，识别功能模块
2. 通过一对一采访澄清模糊点（每次一个问题）
3. 更新 `proposal.md` 的需求概述和模块列表
4. 定义各模块的接口规格
5. 拆分任务并建立 DAG 依赖

**验收标准**：
- [ ] proposal.md 包含完整的需求描述
- [ ] 每个功能模块有明确的输入/输出
- [ ] 接口定义无歧义
- [ ] DAG 图无循环依赖

---

### 2.2 Phase 2: 任务编排

**执行者**：PM Agent

**输入**：proposal.md 中的任务清单
**输出**：执行计划（Phase + 并行策略）

**编排规则**：

```
规则 1: 无依赖的任务可并行执行
规则 2: 同一 Phase 内的任务之间无数据依赖
规则 3: 最大并行度 = min(可用 SubAgent 数, 当前 Phase 任务数)
规则 4: 资源受限时间优先执行关键路径上的任务
规则 5: 每个 Phase 结束后进行阶段验收
```

**Phase 划分模板**：

| Phase | 任务类型 | 并行度 | 验收点 |
|-------|---------|--------|--------|
| Phase 1 | 基础设施（Proto/解析器） | 1-2 | 解析器可运行 |
| Phase 2 | 核心实现（三端 SDK） | 2-3 | 各端编译通过 |
| Phase 3 | 中间件（数据同步/装饰器） | 2-3 | 功能可用 |
| Phase 4 | 集成（构建脚本/示例） | 1-2 | 端到端可用 |
| Phase 5 | 验收（测试/文档） | 1-2 | 全部通过 |

---

### 2.3 Phase 3: 执行实现

**执行者**：Implement SubAgent(s)

**调度原则**：

```
1. SubAgent 接收的任务描述必须包含：
   - 明确的实现目标
   - 上游依赖（哪些文件/模块已就绪）
   - 下游影响（产出会被谁消费）
   - 验收标准

2. SubAgent 只回传：
   - 任务状态：SUCCESS / FAILED / BLOCKED
   - 关键变更摘要：修改了哪些文件，做了什么
   - 失败原因（如有）

3. 信息传递方式：
   - 少量信息：SubAgent 直接回传
   - 大量代码/配置：通过文件路径传递
   - 中间产物：写入约定的临时目录
```

**SubAgent Prompt 模板**：

```
你是一个 Implement SubAgent。你的任务是：

## 任务 ID: T{n}
## 模块: {module_name}
## 目标: {description}

## 上下文
- 上游依赖已就绪：{upstream_tasks}
- 关键文件：{relevant_files}
- 约束参考：specsv2/constraints.md

## 要求
1. 实现目标功能
2. 确保代码可编译
3. 遵循约束规范

## 回传格式
- 状态: SUCCESS / FAILED
- 变更文件: [file1, file2, ...]
- 关键实现: [摘要描述]
- 问题（如有）: [问题描述]
```

---

### 2.4 Phase 4: 验收测试

**执行者**：Test SubAgent

**这是 Harness 体系的核心阶段。**

> **强制规则**：每个 SubAgent 完成代码修改后，必须由 Test SubAgent 执行构建命令验证。代码修改未通过构建验证不算完成。

#### 2.4.0 构建验证门禁（Build Gate）

代码变更后的**第一道关卡**，必须在任何任务标记完成前通过：

```
SubAgent 回报“实现完成”
    │
    ▼
Test SubAgent 执行构建命令（Bash）
    │
    ├── BUILD SUCCESSFUL → 检查产物 → 标记任务完成
    ├── BUILD FAILED → 回传错误 → SubAgent 修复 → 重新验证
    └── 未执行构建 → 禁止标记完成（流程违规）
```

**构建验证命令清单**：

| 变更范围 | 执行命令 | 通过标准 |
|---------|---------|----------|
| Android SDK | `cd android; .\gradlew.bat :and_web_library:assembleDebug` | BUILD SUCCESSFUL |
| 鸿蒙 SDK | `npm run build:harmony` | BUILD SUCCESSFUL + HAR 输出 |
| 前端 SDK | `npm run build:web` | vite build 无错误 + TGZ 输出 |
| 全部三端 | `npm run build:all` | 三端均成功 + output/ 完整 |

#### 2.4.1 测试分层

| 层级 | 测试类型 | 工具/方法 | 触发时机 |
|------|---------|----------|---------|
| L1 | 编译测试 | `build` 命令 | 每次代码变更 |
| L2 | 单元测试 | 各端测试框架 | 功能模块完成 |
| L3 | 集成测试 | 端到端运行 | Phase 结束 |
| L4 | 回归测试 | 全量构建 | 发版前 |

#### 2.4.2 各端测试策略

**Android 端测试**：

| 测试项 | 方法 | 验收标准 |
|--------|------|---------|
| 编译成功 | `gradlew.bat :and_web_library:assembleRelease` | BUILD SUCCESSFUL |
| KSP 生成正确 | 检查 `DataSyncBindings.kt` 内容 | 类名→通道映射正确 |
| Proto Codegen | 检查 generated/ 目录产物 | 注解/常量/setter 与 proto 一致 |
| 运行时验证 | 示例 App 运行 | WebView 加载正常，数据推送成功 |

**鸿蒙端测试**：

| 测试项 | 方法 | 验收标准 |
|--------|------|---------|
| 编译成功 | `hvigorw.js assembleHar` | BUILD SUCCESSFUL |
| Codegen 产物 | 检查 generated/*.ets | 通道常量/方法/setter 正确 |
| JSBridge 通信 | 示例页面运行 | sync/async 调用正常 |

**前端 SDK 测试**：

| 测试项 | 方法 | 验收标准 |
|--------|------|---------|
| 构建成功 | `cd vue-web-sdk && npm run build` | 无错误 |
| 类型检查 | `vue-tsc --declaration` | 无类型错误 |
| 产物完整 | 检查 dist/ 内容 | ESM + CJS + .d.ts 均存在 |
| 装饰器工作 | 示例 App 运行 | @wait*Sync 装饰的方法请求被正确阻塞和释放 |

#### 2.4.3 Test SubAgent Prompt 模板

```
你是一个 Test SubAgent。你的任务是验证以下变更的正确性：

## 验证范围
- 变更模块: {modules}
- 变更文件: {files}

## 测试步骤
1. **执行构建验证（强制）**: `{build_command}` → 确认 BUILD SUCCESSFUL
2. 检查生成产物: {artifacts_to_check}
3. 运行示例验证: {demo_command}

## 回传格式
- 构建验证: PASS / FAIL + 错误日志（仅失败时）
- 产物检查: PASS / FAIL + 差异描述
- 示例验证: PASS / FAIL + 行为描述
- 总体结论: ACCEPTED / REJECTED
- 建议修复（如 REJECTED）: [具体建议]

> **禁止**：未执行构建命令就回传 ACCEPTED。
```

---

### 2.5 Phase 5: 交付

**执行者**：PM Agent

**交付检查清单**：

| 检查项 | 说明 |
|--------|------|
| 构建通过 | `npm run build:all` 无错误 |
| 测试通过 | 所有 Test SubAgent 报告 ACCEPTED |
| 文档同步 | proposal.md / Design.md / Wiki.md 已更新 |
| Git 提交 | 变更已 commit（格式符合规范） |
| 产物就绪 | output/ 目录下三端产物完整 |

---

## 3. 异常处理

### 3.1 任务失败

```
SubAgent 报告 FAILED
    │
    ├── 分析失败原因
    │   ├── 编译错误 → 修复后重试
    │   ├── 依赖缺失 → 补充依赖后重试
    │   └── 设计缺陷 → 回退到 PM 重新规划
    │
    └── 重试策略
        ├── 自动重试（最多 2 次）
        └── 2 次失败 → 上报 PM，人工介入
```

### 3.2 依赖阻塞

```
任务 T_n 被 T_m 阻塞
    │
    ├── 检查 T_m 状态
    │   ├── 正在执行 → 等待完成
    │   ├── 已失败 → 触发 T_m 重试流程
    │   └── 取消 → 评估 T_n 是否可调整依赖
    │
    └── 替代方案
        └── T_n 是否有 Mock/Stub 方案可先行推进
```

### 3.3 上下文溢出预防

```
预防策略：
1. SubAgent 回传内容 < 500 字（仅状态+摘要）
2. 大量代码通过 git diff 文件传递
3. 中间产物写入 specsv2/artifacts/ 临时目录
4. 复杂任务先由 Search SubAgent 收集信息，再交给 Implement SubAgent
5. PM Agent 维护 TodoList 作为进度跟踪，不保留完整代码
```

---

## 4. Harness 配置模板

### 4.1 新项目 Harness 初始化

```yaml
# harness-config.yaml（概念配置，实际由 PM Agent 内存管理）
project: mp-sdk
phases:
  - name: foundation
    tasks: [T1, T2, T3]
    parallel: true
    acceptance: build_success
  - name: core
    tasks: [T4, T5, T6, T7]
    parallel: true
    acceptance: compile_pass + api_check
  - name: integration
    tasks: [T8, T9]
    parallel: false
    acceptance: e2e_pass
  - name: delivery
    tasks: [T10]
    parallel: false
    acceptance: test_pass + doc_sync

test_agents:
  - name: build_tester
    trigger: after_each_phase
    action: run_build_commands
  - name: artifact_checker
    trigger: after_codegen
    action: verify_generated_files
  - name: integration_tester
    trigger: before_delivery
    action: run_example_apps

max_parallel_agents: 3
retry_policy:
  max_retries: 2
  backoff: immediate
```

### 4.2 需求变更时的 Harness 流程

```
1. 需求变更请求 → 更新 proposal.md
2. 影响分析 → 识别受影响的 DAG 任务
3. 任务调整 → 新增/修改/取消任务
4. 重新编排 → 更新 DAG 和 Phase
5. 增量执行 → 仅执行受影响的任务
6. 增量验收 → 验证变更不影响已有功能
```

---

## 5. 度量指标

| 指标 | 定义 | 目标 |
|------|------|------|
| **Phase 通过率** | 一次性通过验收的 Phase 比例 | ≥ 80% |
| **任务重试率** | 需要重试的任务比例 | ≤ 20% |
| **上下文效率** | PM Agent 有效信息占比 | ≥ 60% |
| **并行利用率** | SubAgent 实际并行时间 / 总执行时间 | ≥ 50% |
| **文档同步率** | 代码变更与文档更新的同步比例 | 100% |

---

## 6. 快速参考：PM Agent 决策树

```
收到用户需求
    │
    ├── 需求清晰？
    │   ├── 否 → 采访澄清（每次一问）
    │   └── 是 → 继续
    │
    ├── 需要新建模块？
    │   ├── 是 → 更新 proposal.md，创建新任务
    │   └── 否 → 更新现有任务
    │
    ├── 有 DAG 依赖？
    │   ├── 是 → 按 Phase 编排
    │   └── 否 → 直接执行
    │
    ├── 可并行？
    │   ├── 是 → 开启多个 SubAgent
    │   └── 否 → 顺序执行
    │
    └── 执行完毕？
        ├── 是 → 开启 Test SubAgent 验收
        └── 否 → 继续执行 / 处理异常
```
