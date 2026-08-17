# MP-SDK 能力接入规范

> **SSD (Spec-Driven Development)** — MCP (Model Context Protocol) 与 Skill 的接入与使用规范。
> 本文档定义 AI Agent 在项目中可用的外部能力扩展，确保能力接入标准化、可追溯。

---

## 1. 能力架构

### 1.1 能力层级

```
Agent 能力体系
├── 内置能力（Built-in Tools）
│   ├── 文件操作：Read / Write / SearchReplace / Glob / Grep
│   ├── 终端操作：Bash
│   ├── 搜索能力：Agent(Search) / Agent(CodeReview)
│   └── 记忆系统：SearchMemory / UpdateMemory
│
├── MCP 服务（Model Context Protocol）
│   ├── browser-use：浏览器自动化操控
│   ├── genui：可视化组件生成
│   └── qoder-computer-use：桌面应用操控
│
└── Skill 技能（Slash Commands）
    ├── canvas：可视化画布创建
    ├── create-plugin：插件创建
    ├── create-skill：技能创建
    ├── create-subagent：子Agent创建
    ├── harness：Harness 生命周期管控
    ├── security-scan：安全扫描
    └── vercel-deploy：Vercel 部署
```

### 1.2 能力发现

Agent 可通过以下方式发现可用能力：

| 方式 | 说明 |
|------|------|
| MCP 目录扫描 | 读取 `mcps/` 目录下的 SERVER_METADATA.json 和 tools/*.json |
| Skill 列表 | 从系统提示中获取可用 Skill 名称和描述 |
| 能力注册表 | 本文档第 2/3 节定义的接入规范 |

---

## 2. MCP 接入规范

### 2.1 接入流程

```
1. 发现：读取 MCP 目录，获取服务器元数据
2. 理解：读取具体 Tool 的 JSON Schema
3. 验证：确认参数类型和必填项
4. 调用：通过 CallMcpTool 执行
5. 处理：解析返回结果
```

### 2.2 可用 MCP 服务

#### browser-use（浏览器自动化）

| 属性 | 值 |
|------|------|
| **服务名** | `browser-use` |
| **用途** | 浏览器页面操控、UI 测试、截图 |
| **适用场景** | 前端 SDK 集成测试、WebView 页面验证 |

**可用工具**：

| 工具 | 功能 | 使用场景 |
|------|------|---------|
| `list_pages` | 列出打开的页面 | 检查浏览器状态 |
| `select_page` | 选择活动页面 | 切换测试上下文 |
| `navigate_page` | 导航到 URL | 加载测试页面 |
| `click` | 点击元素 | 交互测试 |
| `fill` | 填充表单 | 表单验证 |
| `take_screenshot` | 截图 | 视觉验证 |
| `take_snapshot` | 获取页面快照 | DOM 状态验证 |
| `evaluate_script` | 执行 JS 脚本 | Bridge 功能验证 |
| `list_network_requests` | 列出网络请求 | 请求拦截验证 |
| `list_console_messages` | 列出控制台日志 | 错误检测 |

**在 MP-SDK 中的应用**：
```
场景 1: 验证前端 SDK 数据同步
  → navigate_page 加载示例页面
  → list_network_requests 检查请求是否被正确阻塞
  → evaluate_script 模拟 Native 推送数据
  → list_network_requests 验证请求释放

场景 2: 跨平台 UI 一致性验证
  → take_screenshot 捕获各端渲染结果
  → 对比截图检查一致性
```

#### genui（可视化组件）

| 属性 | 值 |
|------|------|
| **服务名** | `genui` |
| **用途** | 生成可视化组件和 Widget |
| **适用场景** | 数据可视化、Dashboard 生成 |

**可用工具**：

| 工具 | 功能 |
|------|------|
| `show_widget` | 展示可视化组件 |
| `load_guidelines` | 加载设计规范指南 |

#### qoder-computer-use（桌面操控）

| 属性 | 值 |
|------|------|
| **服务名** | `qoder-computer-use` |
| **用途** | 桌面应用操控 |
| **适用场景** | IDE 操作、DevEco Studio 操控 |

**可用工具**：

| 工具 | 功能 |
|------|------|
| `list_apps` | 列出运行中的应用 |
| `list_windows` | 列出窗口 |
| `launch_app` | 启动应用 |
| `click` / `drag` / `scroll` | 鼠标操作 |
| `type_text` / `press_key` | 键盘输入 |
| `take_screenshot` | 截图 |

### 2.3 MCP 使用约束

| 约束 | 说明 |
|------|------|
| Schema 先读 | 调用任何 MCP Tool 前必须先读取其 JSON Schema |
| 不猜测参数 | 参数名和类型严格从 Schema 获取 |
| 错误处理 | MCP 调用失败时需记录错误并尝试降级方案 |
| 幂等优先 | 优先使用读操作（list/take），写操作需谨慎 |
| 上下文节省 | MCP 返回大量数据时，只提取关键信息回传 |

### 2.4 MCP 接入注册模板

当项目需要新增 MCP 服务时，按以下模板注册：

```markdown
### {service_name}

| 属性 | 值 |
|------|------|
| **服务名** | `{server_name}` |
| **用途** | {description} |
| **接入条件** | {prerequisites} |
| **限制** | {limitations} |

**可用工具**：
| 工具 | 功能 | 本项目使用场景 |
|------|------|---------------|
| `{tool_name}` | {function} | {use_case} |

**调用示例**：
```json
{
  "server_name": "{server_name}",
  "tool_name": "{tool_name}",
  "arguments": { /* from schema */ }
}
```
```

---

## 3. Skill 接入规范

### 3.1 可用 Skill

| Skill | 触发方式 | 功能 | 适用场景 |
|-------|---------|------|---------|
| **harness** | `/harness` | Harness 生命周期管控 | 需求分析→实现→验收全流程 |
| **security-scan** | `/security-scan` | 代码安全扫描 | 推送/PR 前安全检查 |
| **canvas** | `/canvas` | 可视化画布 | 架构图、流程图创建 |
| **vercel-deploy** | `/vercel-deploy` | Vercel 部署 | 前端示例部署 |
| **create-skill** | `/create-skill` | 创建新 Skill | 扩展 Agent 能力 |
| **create-plugin** | `/create-plugin` | 创建插件 | 打包可复用能力 |
| **create-subagent** | `/create-subagent` | 创建专用 SubAgent | 特定领域 Agent |

### 3.2 Skill 使用规范

#### harness Skill

```
使用场景：
  - 启动新需求的完整开发流程
  - 管控从分析到验收的 Harness 生命周期
  - 处理重复性摩擦和会话管理

触发方式：/harness

工作模式：
  - 默认只读（分析模式）
  - 配合 qoder-harness-fix-output 回调进行修复
  - 管理 Agent 生命周期
```

#### security-scan Skill

```
使用场景：
  - 代码推送前执行 L2 轻量级安全扫描
  - PR 合并前执行 L3 深度安全审查
  - 指定路径的安全扫描

触发方式：/security-scan 或显式请求

扫描级别：
  - L2 (Lightweight): 快速扫描，检查常见问题
  - L3 (Deep): 深度扫描，含逻辑漏洞和安全漏洞

集成时机：
  - git push 前自动提示
  - PR 创建时建议执行
```

### 3.3 自定义 Skill 创建规范

当项目需要创建自定义 Skill 时：

```
1. 使用 /create-skill 启动创建向导
2. Skill 文件存放位置：项目根目录 .qoder/skills/ 或全局配置
3. Skill 命名规范：{domain}-{action}，如 bridge-test, proto-validate
4. Skill 内容要求：
   - 明确的触发条件（slash command）
   - 清晰的输入参数定义
   - 具体的执行步骤
   - 预期的输出格式
```

### 3.4 推荐的项目专用 Skill

以下是 MP-SDK 项目推荐创建的自定义 Skill：

#### bridge-test

| 属性 | 值 |
|------|------|
| **触发** | `/bridge-test` |
| **功能** | 自动化 JSBridge 通信测试 |
| **步骤** | 1. 启动前端示例 → 2. 通过 browser-use 加载 → 3. 模拟 Native 推送 → 4. 验证数据同步 |

#### proto-validate

| 属性 | 值 |
|------|------|
| **触发** | `/proto-validate` |
| **功能** | Proto 文件变更验证 |
| **步骤** | 1. 检测 proto 变更 → 2. 运行三端 codegen → 3. 验证生成产物 → 4. 报告差异 |

#### sdk-build

| 属性 | 值 |
|------|------|
| **触发** | `/sdk-build` |
| **功能** | SDK 全量构建与产物验证 |
| **步骤** | 1. 执行 build:all → 2. 检查产物完整性 → 3. 验证版本号一致性 |

---

## 4. 能力矩阵：任务 × 能力

| 任务类型 | 推荐工具 | 备选工具 |
|---------|---------|---------|
| 代码实现 | Write / SearchReplace | — |
| 代码搜索 | Agent(Search) | Grep / Glob |
| 编译构建 | Bash | — |
| 前端测试 | browser-use MCP | Agent(Browser) |
| 安全审查 | security-scan Skill | Agent(CodeReview) |
| 架构可视化 | canvas Skill | genui MCP |
| 文档生成 | Write | — |
| 部署发布 | vercel-deploy Skill | Bash |
| 信息收集 | Agent(Search) + SearchMemory | — |
| 进度跟踪 | TodoWrite | — |

---

## 5. 能力接入安全规范

| 规范 | 说明 |
|------|------|
| 最小权限 | Agent 只请求完成任务所需的最小权限 |
| 写操作确认 | 涉及文件删除、网络请求、系统配置的 MCP 操作需用户确认 |
| 凭据保护 | 不在 Skill/MCP 调用中传递 API Key、密码等敏感信息 |
| 审计日志 | 关键 MCP 操作记录到 specsv2/artifacts/mcp-audit.log |
| 版本锁定 | MCP 服务和 Skill 的版本在文档中明确记录 |

---

## 6. 能力演进路线

### 6.1 短期（当前迭代）

- [x] browser-use MCP 用于前端集成测试
- [x] harness Skill 用于全流程管控
- [x] security-scan Skill 用于安全审查

### 6.2 中期（下一迭代）

- [ ] 自定义 `bridge-test` Skill 实现一键 Bridge 测试
- [ ] 自定义 `proto-validate` Skill 实现 Proto 变更自动验证
- [ ] 集成 CI/CD 平台的安全扫描 Hook

### 6.3 长期（远景规划）

- [ ] AI 驱动的 Proto Schema 设计建议
- [ ] 自动化跨平台兼容性测试矩阵
- [ ] SDK 使用分析 Dashboard（genui MCP）
