# Infilux Architecture

## 概览

Infilux 是一个基于 Electron 的 Git Worktree 管理器与多 Agent 开发工作台。系统的核心目标不是“单个窗口内展示 Git 信息”，而是围绕 **worktree 隔离、会话隔离、编辑上下文隔离、跨进程契约清晰** 这四件事构建完整开发环境。

当前架构采用典型的 Electron 四层分离：

```text
Renderer UI
  -> window.electronAPI (preload bridge)
    -> IPC channels / push events
      -> Main-process handlers
        -> Native services / child processes / filesystem / remote runtime
```

这意味着：

- **Renderer** 负责交互、状态编排、视图组合
- **Preload** 负责受控桥接，不承载业务逻辑
- **Main** 负责系统能力、资源生命周期与安全边界
- **Shared** 负责跨进程契约与纯工具

---

## 架构原则

### 1. Worktree-first

Worktree 不是仓库的附属功能，而是系统的一等核心对象。很多状态都是以 worktree 为边界保存和恢复的，例如：

- 编辑器标签与光标状态
- 终端会话
- Agent 会话
- Source Control 上下文

### 2. 明确的进程边界

- Renderer 不直接访问 Electron / Node 原语
- 所有主进程能力通过 preload 暴露为受控 API
- Shared 只做契约，不反向依赖 main / renderer / preload

### 3. 保持挂载，保留运行时状态

主面板切换时，File / Terminal / Source Control 等面板默认 **keep-mounted**，通过 CSS 隐藏而不是卸载。这样可以保留：

- Monaco 编辑状态
- xterm.js 会话
- 面板内部订阅与运行态

### 4. 本地与远程双模式并存

系统不能只按本地仓库假设设计。文件读写、目录浏览、watcher、路径语义都需要同时考虑：

- 本地路径
- remote virtual path

---

## 技术栈

| Layer | Technology |
|-------|------------|
| Desktop Shell | Electron 39 |
| Frontend | React 19 + TypeScript 5.9 |
| Styling | Tailwind CSS 4 |
| UI State | Zustand |
| Async Data | TanStack React Query |
| Editor | Monaco Editor + local workers + Shiki |
| Terminal | xterm.js + node-pty |
| Git | simple-git |
| Build | electron-vite + electron-builder |
| Quality | TypeScript + Biome + Vitest |

---

## 项目结构

```text
src/
├── main/                 # Electron 主进程：生命周期、IPC、系统能力、原生资源
│   ├── index.ts
│   ├── ipc/
│   ├── services/
│   └── utils/
├── preload/              # Context Bridge：暴露 window.electronAPI
│   ├── index.ts
│   └── types.ts
├── renderer/             # React 前端：布局、组件、stores、hooks
│   ├── App.tsx
│   ├── App/
│   ├── components/
│   ├── hooks/
│   ├── stores/
│   └── lib/
└── shared/               # 跨进程共享契约与纯工具
    ├── types/
    └── utils/
```

补充目录：

```text
docs/                     # 架构与设计文档
resources/                # 静态资源与生成资源
scripts/                  # 开发/构建辅助脚本
build/                    # Electron Builder 资源
```

---

## Main Process (`src/main`)

Main process 负责受信任系统能力与资源生命周期控制。

### 启动流程

```text
app.whenReady()
  -> bootstrap app services
  -> registerIpcHandlers()
  -> createMainWindow()
```

关键点：

- 启动时完成 IPC 注册
- 窗口关闭与应用退出要区分处理
- 退出时必须清理 PTY、watcher、remote 连接、临时资源与长生命周期服务

### 生命周期与清理

当前存在两条清理链路：

- **正常退出**：`cleanupAllResources()`
- **信号退出**：`cleanupAllResourcesSync()`

这条链路是高风险区，修改时需要同时考虑：

- 异步优雅退出
- 同步兜底退出
- 子进程与 watcher 是否泄漏
- 原生模块是否可能二次销毁

### IPC 设计

系统遵循统一扩展路径：

```text
src/shared/types/ipc.ts
  -> src/main/ipc/<domain>.ts
    -> src/preload/index.ts
      -> renderer consumer
```

含义：

1. 先定义 channel 常量与共享 payload 类型
2. 再在 main 中实现 handler
3. 再通过 preload 暴露桥接 API
4. 最后由 renderer 使用

不要跳过其中任何一层，否则契约容易漂移。

### Handler 与 Service 的职责边界

- `ipc/*.ts`：参数接收、调用 service、返回序列化结果
- `services/*`：承载业务逻辑、状态管理、外部进程/系统交互

当 handler 出现以下情况，应下沉到 service：

- 参数变多且逻辑变复杂
- 逻辑被多个 handler 复用
- 涉及生命周期、缓存、权限、子进程、remote 状态

### 关键子系统

#### Git / Worktree

位置：

- `src/main/services/git/`
- `src/main/ipc/git.ts`
- `src/main/ipc/worktree.ts`

职责：

- Git 操作封装
- worktree 生命周期管理
- 分支/提交/差异相关能力
- 与 AI 生成提交信息、代码审查等流程协作

#### Session / Terminal / Agent

这是最容易混淆的三层，需要明确边界：

- **session**
  - 拥有 session identity
  - 管理 attach / detach / lifecycle
  - 负责高层会话语义
- **terminal**
  - 拥有 PTY 创建、resize、IO、destroy
  - 负责底层进程 transport
- **agent**
  - 管理 agent metadata、registry、状态通知、停止通知
  - 不应吞并 session 或 PTY 细节

简化理解：

```text
session = 会话语义
terminal = PTY 传输
agent = Agent 编排与元信息
```

#### Files / Watchers

位置：

- `src/main/ipc/files.ts`
- `src/main/services/files/`

职责：

- 本地/远程文件读写
- 编码检测
- 二进制保护
- watcher 生命周期管理

设计要求：

- sender / webContents 销毁时必须回收相关资源
- 不能假设文件系统只存在本地路径

#### Remote Runtime

位置：

- `src/main/services/remote/`
- `src/main/ipc/remote.ts`

这是当前最重、最状态化的子系统之一，负责：

- 远程连接
- helper 安装与校验
- remote runtime 资源
- 远程仓库文件/目录能力
- 连接状态变化后的订阅与恢复

此区域改动需要格外注意状态机与资源回收。

#### Claude / MCP / Provider 集成

位置：

- `src/main/services/claude/`
- `src/main/ipc/claude*.ts`

设计原则：

- provider、prompts、plugins、completions、IDE bridge 分而治之
- 不要把无关逻辑继续塞进 `ClaudeIdeBridge.ts`

---

## Preload (`src/preload`)

Preload 是 renderer 与 main 之间的安全桥。

职责：

- 暴露 `window.electronAPI`
- 把 renderer 请求翻译为 IPC invoke / subscription
- 把主进程事件包装为可取消订阅的回调

它**不应该**：

- 承载业务逻辑
- 暴露原始 `ipcRenderer`
- 暴露通用 `invoke(channel, ...args)` 后门
- 直接暴露底层 shell / filesystem / process primitives

换句话说，preload 应始终是 **scoped API surface**，不是万能透传层。

---

## Renderer Process (`src/renderer`)

Renderer 负责 UI 组合、状态管理与用户交互编排。

### 布局系统

主要入口：

- `src/renderer/App.tsx`
- `src/renderer/components/layout/MainContent.tsx`

`MainContent.tsx` 是核心调度器，承载多个主面板：

```text
MainContent
├── Chat / Agent Panel
├── File Panel
├── Terminal Panel
├── Source Control Panel
├── Todo Panel
└── Settings Panel
```

关键特征：

- 主面板切换时保留挂载
- 通过 `invisible pointer-events-none` 等方式隐藏非激活面板
- 保持编辑器与终端的运行态连续性

### 状态管理

Renderer 使用两类状态：

- **Zustand**：本地交互状态、跨组件共享 UI 状态
- **React Query**：异步数据获取、缓存与失效

#### 关键 store 边界

- `editor.ts`
  - open tabs
  - active file
  - pending cursor
  - per-worktree editor state
- `navigation.ts`
  - 一次性导航请求总线
  - 不是持久编辑器状态
- `agentSessions.ts`
  - Agent 会话 UI 状态
- `terminal.ts` / `terminalWrite.ts`
  - 终端相关本地状态
- `settings.ts`
  - 兼容入口
  - 实际实现已模块化到 `stores/settings/`

#### 关键 orchestration hooks

- `App/hooks/useWorktreeSelection.ts`
  - worktree 切换时的状态同步与未保存处理
- `App/hooks/useAppLifecycle.ts`
  - 应用关闭与 dirty-state 协调
- `hooks/useFileTree.ts`
  - 文件树懒加载、展开状态、自动 reveal
- `hooks/useXterm.ts`
  - xterm.js 深度集成

经验规则：

- 不要在 panel 组件内部重新发明这些 orchestration 流程
- store 冲突时应先确认现有 ownership，而不是新增平行状态源

### 编辑器架构

核心位置：

- `src/renderer/components/files/FilePanel.tsx`
- `src/renderer/components/files/CurrentFilePanel.tsx`
- `src/renderer/components/files/EditorArea.tsx`
- `src/renderer/stores/editor.ts`

当前编辑器的关键要求：

- worktree 切换时恢复标签与激活状态
- 支持本地路径与 remote virtual path
- 处理外部文件修改冲突
- 支持 preview / blame / breadcrumbs 等复合功能

`EditorArea.tsx` 是高复杂度热点文件，改动应视为架构级改动。

### 文件树与导航

文件树逻辑集中在：

- `hooks/useFileTree.ts`
- `components/files/FileTree.tsx`

导航语义集中在：

- `stores/navigation.ts`
- `App/hooks/useTerminalNavigation.ts`

原则：

- 不要新增第三套文件打开/跳转状态
- 新入口应尽量收敛到现有导航语义

### 终端架构

位置：

- `hooks/useXterm.ts`
- `components/terminal/`
- `components/chat/AgentTerminal.tsx`

终端能力包括：

- WebGL 优先渲染
- 输出缓冲合并
- 文件路径链接识别
- 与 worktree / session / agent 协同

---

## Shared Layer (`src/shared`)

Shared 层是跨进程契约与纯工具层。

职责：

- `types/ipc.ts`：IPC vocabulary source of truth
- `types/*.ts`：跨层共享 payload / domain types
- `utils/*.ts`：纯函数工具

约束：

- 不导入 `src/main/`
- 不导入 `src/renderer/`
- 不导入 `src/preload/`
- 不放 Electron-specific code

如果 shared 反向依赖进程实现，架构边界就会被污染。

---

## 远程与本地双模式模型

本地/远程不是附加特性，而是贯穿式约束。

受影响区域包括：

- 文件路径表示
- 文件读写
- watcher
- 背景资源解析
- 编辑器打开/保存
- source control root

所有文件能力设计都应先问一句：

> 这段逻辑在 remote virtual path 下是否仍然成立？

---

## 质量保障与验证

当前项目已具备基础自动化验证能力，不应再假设“只有 TypeScript + Lint”。

标准检查：

```bash
pnpm typecheck
pnpm lint
pnpm test
```

说明：

- `pnpm` 是项目标准包管理器
- `Vitest` 用于有针对性的单元测试
- 大型重构至少应覆盖 typecheck 与 lint，必要时补 focused tests

---

## 当前架构热点

以下位置属于高风险区：

- `src/main/index.ts`
- `src/main/ipc/index.ts`
- `src/main/ipc/files.ts`
- `src/main/services/remote/RemoteConnectionManager.ts`
- `src/main/services/claude/ClaudeIdeBridge.ts`
- `src/renderer/App.tsx`
- `src/renderer/components/layout/MainContent.tsx`
- `src/renderer/components/layout/TreeSidebar.tsx`
- `src/renderer/components/files/FileTree.tsx`
- `src/renderer/components/files/EditorArea.tsx`
- `src/renderer/hooks/useXterm.ts`

这些文件的修改通常不是“局部修补”，而是会影响系统边界与协作方式的架构变更。

---

## 关键设计决策

1. **Worktree 隔离优先**
   把分支切换问题转化为物理隔离与上下文隔离问题。

2. **跨进程契约显式化**
   所有能力通过 shared + preload + main 串联，不允许 renderer 越权。

3. **面板保持挂载**
   用运行态连续性换取更好的编辑/终端体验。

4. **本地与远程统一建模**
   避免后期把 remote 逻辑当作特例修补。

5. **复杂热点集中治理**
   接受 `EditorArea.tsx`、remote runtime、app orchestration 等热点存在，但要求修改时按架构问题处理。
