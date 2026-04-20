<p align="center">
  <picture>
    <source srcset="src/renderer/assets/logo.svg" type="image/svg+xml" />
    <img src="docs/assets/logo.png" alt="Infilux Logo" width="120" />
  </picture>
</p>

<h1 align="center">Infilux</h1>

<p align="center">
  <strong>多路智能，并行穿梭</strong>
</p>
<p align="center">
  让多路 AI 助手化身并行线程，在同一个项目的不同分支间自由穿梭。<br/>
  Claude、Gemini 与 Codex 同步协作，思路永不中断。
</p>
<p align="center">
  <a href="README.zh.md">中文</a> | <a href="README.md">English</a>
</p>

<p align="center">
  <a href="https://github.com/funenc-lab/infilux/releases/latest"><img src="https://img.shields.io/github/v/release/funenc-lab/infilux?style=flat&color=blue" alt="Release" /></a>
  <img src="https://img.shields.io/badge/Electron-39+-47848F?logo=electron&logoColor=white" alt="Electron" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white" alt="React" />
  <img src="https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/License-MIT-green" alt="License" />
</p>

<p align="center">
  <a href="https://t.me/EnsoAI_news"><img src="https://img.shields.io/badge/更新频道-Telegram-26A5E4?logo=telegram&logoColor=white" alt="Telegram Channel" /></a>
  <a href="https://t.me/EnsoAi_Offical"><img src="https://img.shields.io/badge/官方交流群-Telegram-26A5E4?logo=telegram&logoColor=white" alt="Telegram Group" /></a>
</p>

<p align="center">
  <a href="https://www.producthunt.com/products/ensoai?utm_source=badge-featured&utm_medium=badge&utm_campaign=badge-ensoai" target="_blank"><img src="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=1057621&theme=light" alt="Infilux - Multiple AI Agents, Parallel Workflow in Git Worktrees | Product Hunt" width="250" height="54" /></a>
</p>

---

## 重构你的工作流

告别 git stash。Infilux 将每个分支视为一等公民，赋予其独立的工作区与 AI 上下文。

![Infilux 工作区总览](docs/assets/readme-workspace.png)

---

## 本文截图使用的示例项目

下面的截图全部来自当前应用构建，并基于一个临时创建的演示仓库 `Example App` 拍摄。
这样文档里的状态来自真实 worktree，而不是静态拼图。

- 仓库: `Example App`
- Worktree: `main`、`feature/docs-refresh`
- 已暂存改动: `package.json`、`src/main.ts`
- 未暂存改动: `README.md`
- 未跟踪文件: `src/components/ReviewPanel.tsx`

合并冲突截图使用了另一个临时仓库 `Merge Demo`，这样内置 merge editor 展示的是真实冲突状态。

```text
Example App
├── README.md
├── package.json
├── docs/
│   └── workflow-notes.md
└── src/
    ├── main.ts
    └── components/
        ├── ReviewPanel.tsx
        └── WorktreeStatus.tsx
```

---

## 项目来源

Infilux 是此前以 **EnsoAI** 对外发布的同一个项目的延续版本。

这次变更主要是产品品牌与主仓库标识的迁移，不是项目重启，也不是新 fork。当前应以
下面这些地址作为正式入口：

- **仓库（SSH）**: `git@github.com:funenc-lab/infilux.git`
- **仓库（HTTPS）**: `https://github.com/funenc-lab/infilux`
- **Releases**: `https://github.com/funenc-lab/infilux/releases/latest`

### 已经完成的变化

- 当前正式产品名为 **Infilux**
- 主 GitHub 仓库已迁移到 `funenc-lab/infilux`
- 新的架构文档与产品文档已经统一使用 Infilux 命名

### 你仍可能看到的旧标识

在迁移窗口期内，一些外部表面仍可能保留旧的 `EnsoAI` 或 `ensoai` 标识，例如：

- 包管理渠道名称
- 社区链接
- 徽章或第三方收录页面
- 较早的截图、博客、issue 讨论或历史发布记录

### 连续性说明

- 当前代码库延续自同一条项目演进线
- 既有发布历史与历史资料依然有效
- 如果你曾经使用过 EnsoAI，你现在所在的位置就是这个项目的后续主线

如果遇到名称不一致，请以 **Infilux** 作为当前官方名称，把 `EnsoAI` / `ensoai`
理解为兼容迁移阶段保留的历史标识。

---

## 安装

### 安装方式

> Infilux 是当前产品名。GitHub Releases 是当前唯一的主发布源；部分包管理器渠道仍使用历史 `ensoai` 或 `J3n5en.EnsoAI` 标识，并且是手工维护，发布时间可能落后于最新 GitHub Release。

### 主下载渠道

从 [GitHub Releases](https://github.com/funenc-lab/infilux/releases/latest) 下载适合你平台的安装包：

| 平台 | 文件 |
|------|------|
| macOS (Apple Silicon) | `Infilux-x.x.x-arm64.dmg` |
| macOS (Intel) | `Infilux-x.x.x.dmg` |
| Windows (安装版) | `Infilux Setup x.x.x.exe` |
| Windows (便携版) | `Infilux-x.x.x-portable.exe` |
| Linux (AppImage) | `Infilux-x.x.x.AppImage` |
| Linux (deb) | `infilux_x.x.x_amd64.deb` |

发布自动化、质量门禁与本地修复路径见 [`docs/release-process.md`](docs/release-process.md)。

### 旧包管理器渠道

这些渠道不属于 GitHub Releases 主发布门禁的一部分，仍保留历史标识，并在需要时手工维护。

**macOS (Homebrew)**

```bash
brew tap j3n5en/ensoai
brew install --cask ensoai
```

**Windows (Scoop)**

```powershell
scoop bucket add ensoai https://github.com/J3n5en/scoop-ensoai
scoop install ensoai
```

**Windows (Winget)**

```powershell
winget install J3n5en.EnsoAI
```

### 从源码构建

```bash
# 克隆仓库
git clone git@github.com:funenc-lab/infilux.git Infilux
cd Infilux

# 安装依赖（需要 Node.js 20+、pnpm 10+）
pnpm install

# 开发模式运行
pnpm dev

# 生产构建
pnpm build:mac    # macOS
pnpm build:win    # Windows
pnpm build:linux  # Linux
```

---

## 功能特性

### 按 Worktree 隔离的 Agent 会话

每个 worktree 都有独立的 Agent 入口、启动动作与上下文，不需要切出当前分支就能开始协作。

内置支持：
- **Claude** - Anthropic 的 AI 助手，支持持久化会话工作流
- **Codex** - OpenAI 的编程助手
- **Gemini** - Google 的 AI 助手
- **Cursor** - Cursor 的 AI 助手 (`cursor-agent`)
- **Droid** - Factory CLI，AI 驱动的 CI/CD 助手
- **Auggie** - Augment Code 的 AI 助手

你也可以通过指定 CLI 命令接入自定义 Agent。

---

### 内置代码编辑器

基于 Monaco 的编辑器适合在当前 worktree 内快速修复、查看与补充代码，不必切回外部 IDE 才能完成小步修改。

![Infilux 代码编辑器](docs/assets/readme-editor.png)

- 文件树和编辑器始终绑定当前 worktree
- 适合快速修复、跟进 review、补充说明文件
- 打开的文件会跟随 worktree 上下文保留

---

### 与 Worktree 对齐的版本管理面板

版本管理面板直接展示当前 worktree 的已暂存、未暂存和未跟踪文件，并在右侧打开对应 diff。

![Infilux 版本管理](docs/assets/readme-source-control.png)

- 已暂存、未暂存、未跟踪改动分区清晰
- 选中文件后可直接查看并排 diff
- 提交输入框、刷新和 review 入口保持在同一工作区内

---

### Review 与合并流程

Infilux 会把 review 和 merge 操作留在 worktree 语境里，而不是把你频繁踢回外部工具。

![Infilux 合并编辑器](docs/assets/readme-merge.png)

- 从版本管理直接发起 diff review，并继续切到 Agent 面板追问
- 使用内置三栏合并编辑器处理冲突
- 在合并完成后继续做清理动作，而不是中途切换工具链

---

### Worktree 管理

可以直接创建、切换和清理 Git Worktree，而不需要反复重新打开项目。

- 从现有分支或新分支创建 worktree
- 在不同 worktree 之间切换，并保持各自的编辑器与 Agent 上下文
- 删除 worktree 时可选是否一并删除分支
- 在侧边栏直接查看分支状态

---

### IDE 桥接与日常效率能力

用 Infilux 负责编排，再一键跳转到 VS Code、Cursor、Ghostty 等工具完成深度开发。

- 命令面板用于面板控制和工作区动作
- 多窗口支持并行仓库工作
- 主题可与终端主题同步
- 提供标签切换和工作区导航快捷键
- 设置持久化，方便恢复环境和复用配置

---

## 技术栈

- **框架**: Electron + React 19 + TypeScript
- **样式**: Tailwind CSS 4
- **编辑器**: Monaco Editor
- **终端**: xterm.js + node-pty
- **Git**: simple-git
- **数据库**: sqlite3

---

## 架构速览

Infilux 采用四层分离架构：

```text
Renderer UI
  -> window.electronAPI (preload bridge)
    -> IPC channels / push events
      -> Main-process handlers
        -> Native services / child processes / filesystem / remote runtime
```

核心架构思想：

- **Worktree-first 隔离**：编辑器标签、终端、Agent 会话都以 worktree 为边界保存
- **明确的进程边界**：renderer 不直接访问 Electron / Node 原语
- **面板保持挂载**：File、Terminal、Source Control 等主面板切换时保留运行态
- **本地与远程并存**：文件与导航链路同时支持本地路径与 remote virtual path

项目分层：

- `src/main/` — 生命周期、IPC、系统能力、资源清理
- `src/preload/` — 类型化的 `window.electronAPI` 桥接层
- `src/renderer/` — React UI、Zustand、React Query、Monaco、xterm.js
- `src/shared/` — 跨进程契约与纯工具

相关文档：

- `docs/architecture.md` — 系统级架构、边界、热点与扩展路径
- `docs/editor-architecture.md` — 编辑器、文件树、导航、dirty-state 与外部修改处理链路
- `docs/remote-architecture.md` — 远程仓库模型、remote runtime、virtual path 语义、认证与生命周期

---

## FAQ

### 基础使用

<details>
<summary><strong>Infilux 与普通 IDE 有什么区别？</strong></summary>

Infilux 专注于 **Git Worktree + AI Agent** 的协作场景。它不是要替代 VS Code 或 Cursor，而是作为一个轻量级的工作空间管理器，让你能够：
- 在多个 worktree 之间快速切换，每个 worktree 独立运行 AI Agent
- 同时进行多个功能分支的开发，互不干扰
- 通过 "Open In" 功能随时跳转到你熟悉的 IDE 继续深度开发

</details>

<details>
<summary><strong>支持哪些 AI Agent？</strong></summary>

内置支持 Claude、Codex、Gemini、Cursor Agent、Droid、Auggie。你也可以在设置中添加任意支持 CLI 的 Agent，只需指定启动命令即可。

</details>

<details>
<summary><strong>Agent 会话是否会保留？</strong></summary>

是的。每个 worktree 的 Agent 会话独立保存，切换 worktree 后再切回来，之前的对话上下文仍然存在。

</details>

---

### 使用场景

<details>
<summary><strong>什么时候应该使用 Infilux？</strong></summary>

| 场景 | 说明 |
|------|------|
| **多任务并行开发** | 同时处理 feature-A 和 bugfix-B，每个分支有独立的 AI 会话和终端 |
| **AI 辅助 Code Review** | 在新 worktree 中让 AI 审查代码，主分支开发不受影响 |
| **实验性开发** | 创建临时 worktree 让 AI 自由实验，不满意直接删除 |
| **对比调试** | 同时打开多个 worktree 对比不同实现 |

</details>

<details>
<summary><strong>为什么使用官方 CLI 而不使用 ACP？</strong></summary>

虽然 ACP 能够统一不同 Agent 的核心能力，但是也仅限于核心能力缺失了很多功能。切换不同 Agent 的场景其实并不多而且不同 Agent 的 CLI 核心功能都相似。所以我们认为对于有经验的开发者各 CLI 更具有生产力。

</details>

<details>
<summary><strong>Infilux 适合什么规模的项目？</strong></summary>

中小型项目最为合适。对于大型 monorepo，建议配合 VS Code 等全功能 IDE 使用 —— Infilux 负责 worktree 管理和 AI 交互，IDE 负责深度开发。

</details>

---

### 开发流程

<details>
<summary><strong>使用 Infilux 的典型开发流程是什么？</strong></summary>

```
1. 打开 Workspace
   └── 选择或添加 Git 仓库

2. 创建/切换 Worktree
   └── 为新功能创建 worktree（自动关联新分支）

3. 启动 AI Agent
   └── 在 Agent 面板与 Claude/Codex 等对话
   └── AI 直接在当前 worktree 目录下工作

4. 编辑 & 测试
   └── 使用内置编辑器快速修改
   └── 使用终端运行测试/构建

5. 提交 & 合并
   └── 完成后在终端 git commit/push
   └── 或通过 "Open In" 跳转到 IDE 进行最终审查
```

</details>

<details>
<summary><strong>如何高效管理多个并行任务？</strong></summary>

1. 为每个任务创建独立 worktree（`Cmd+N` 或点击 + 按钮）
2. 使用快捷键 `Cmd+1-9` 快速切换 worktree
3. 每个 worktree 有独立的 Agent 会话、终端标签、编辑器状态
4. 完成后删除 worktree，可选择同时删除分支

</details>

<details>
<summary><strong>AI Agent 生成的代码如何 review？</strong></summary>

推荐流程：
1. 让 AI 在独立 worktree 中生成代码
2. 使用内置编辑器或 "Open In Cursor/VS Code" 审查
3. 满意后在终端提交；不满意可继续对话修改或直接删除 worktree

</details>

---

### 快捷键

<details>
<summary><strong>常用快捷键有哪些？</strong></summary>

| 快捷键 | 功能 |
|--------|------|
| `Cmd+Shift+P` | 打开命令面板 |
| `Cmd+,` | 打开设置 |
| `Cmd+1-9` | 切换到对应标签 |
| `Cmd+T` | 新建终端/Agent 会话 |
| `Cmd+W` | 关闭当前终端/会话 |
| `Cmd+S` | 保存文件 |
| `Shift+Enter` | 终端中输入换行 |

</details>

---

### 故障排除

<details>
<summary><strong>Agent 无法启动？</strong></summary>

1. 确认对应 CLI 工具已安装（如 `claude`、`codex`）
2. 在终端中手动运行命令验证
3. 检查设置中的 Agent 路径配置

</details>

<details>
<summary><strong>终端显示异常/花屏？</strong></summary>

进入设置 → 终端 → 将渲染器从 WebGL 切换为 DOM。

</details>

---

## License

MIT License - 详见 [LICENSE](LICENSE)。
