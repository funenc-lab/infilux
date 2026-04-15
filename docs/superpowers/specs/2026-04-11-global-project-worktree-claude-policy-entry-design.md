# Global / Project / Worktree Claude Policy Entry Design

## 背景

当前实现已经具备：

- 全局只读 `Claude Catalog`
- 项目级 `Project Policy`
- worktree 级 `Worktree Policy`
- Claude 启动时根据项目和 worktree policy 解析 effective policy

但交互层还不完整：

- 全局设置只有查看入口，没有可编辑的全局策略
- 仓库下拉菜单缺少直接进入项目策略的入口
- worktree 菜单虽然有入口，但三层策略关系在交互上不够完整

本次目标是把能力扩成真正的四层模型：

`catalog baseline -> global policy -> project policy -> worktree policy`

并在全局设置、项目菜单、worktree 菜单都提供统一的配置入口。

## 目标

- 新增可编辑 `Global Policy`
- 全局设置、项目菜单、worktree 菜单都提供策略入口
- 三个入口都复用统一的列表式配置弹窗
- 列表项采用三态：
  `Inherit / Enabled / Disabled`
- capability 覆盖全部类型：
  `subagent`、`command`、`legacy-skill`
- MCP 继续区分：
  `shared MCP`、`personal MCP`
- 保存后对已启动 Claude session 做 scope 对应的 stale 标记

## 非目标

- 不做 skill 安装、卸载、下载管理
- 不做 profile/template 体系
- 不做运行中 session 热更新
- 不把 policy 持久化迁移到 repo 文件或 main 进程数据库

## 用户交互设计

### 全局设置

- 原 `Claude Catalog` 页面升级为 `Claude Policy`
- 页面上半区展示 `Global Policy` summary 和 `Edit Global Policy`
- 页面下半区保留 catalog 浏览能力，继续查看所有 discovered capabilities / MCP

### 项目入口

- 在仓库下拉菜单新增 `Project Policy`
- 点击后直接打开统一的 policy editor，scope 为 `project`
- 原 `Repository Settings` 中的项目策略 summary 保留，作为次级入口

### Worktree 入口

- worktree 菜单继续保留 `Worktree Policy`
- 点击后打开统一的 policy editor，scope 为 `worktree`

### 编辑器

- 三个入口全部复用同一个 `ClaudePolicyEditorDialog`
- 新增 `scope = global | project | worktree`
- 文案统一表达为：
  `Inherit / Enabled / Disabled`
- 继续展示 effective preview
- global editor 预览以当前 repo 或当前工作区为上下文；没有上下文时用 catalog-only baseline

## 数据模型

### 新增类型

- `ClaudeGlobalPolicy extends ClaudePolicyConfig`
- `ClaudePolicyProvenanceSource` 新增 `global-policy`

### 解析优先级

1. 先从 catalog 生成默认允许集合
2. 应用 global allow/block
3. 应用 project allow/block
4. 应用 worktree allow/block

规则：

- 上一层没有显式 allow 列表时，默认继承上一层的 allowed baseline
- 某层一旦写入 allow 列表，该层视为白名单基线
- `block` 始终优先于 `allow`
- provenance 记录最终生效决策来自哪一层

## 存储设计

本轮继续使用 renderer local storage，与当前 project/worktree policy 保持一致：

- `enso-claude-global-policy`
- `enso-claude-project-policies`
- `enso-claude-worktree-policies`

这样可以在不重构持久化层的前提下完成本轮需求。

## IPC 与运行时

### 请求结构

原有 preview / launch request 扩展为包含：

- `globalPolicy`
- `projectPolicy`
- `worktreePolicy`

### 启动投影

- Claude session 启动前统一带上 global/project/worktree 三层 policy
- main 进程解析 effective policy 后继续做 runtime projection

## Session stale 设计

- global policy 保存后：
  标记全部带 `claudePolicyHash` 的 Claude session 为 stale
- project policy 保存后：
  标记该 repo 下 Claude session 为 stale
- worktree policy 保存后：
  标记该 worktree 下 Claude session 为 stale

提示文案继续复用现有：

- `Policy changed. Restart sessions to apply.`

## 文件边界

### Shared

- `src/shared/types/claudePolicy.ts`
  负责 global policy 类型与 preview/launch contract
- `src/shared/types/ipc.ts`
  如果需要补充新 contract 字段，保持 preload/main/renderer 同步

### Main

- `src/main/services/claude/ClaudePolicyResolver.ts`
  扩展三层覆盖解析
- `src/main/services/claude/ClaudeSessionLaunchPreparation.ts`
  启动请求接入 global policy
- `src/main/ipc/claudePolicy.ts`
  透传新 request 结构

### Renderer

- `src/renderer/App/storage.ts`
  持久化 global policy
- `src/renderer/components/settings/SettingsShell.tsx`
  全局入口升级
- `src/renderer/components/settings/claude-policy/*`
  统一编辑器支持 global scope
- `src/renderer/components/layout/TreeSidebar.tsx`
  仓库菜单新增 `Project Policy`
  worktree 入口继续接统一编辑器
- `src/renderer/components/repository/RepositorySettingsDialog.tsx`
  项目策略 summary 改为读取 global + project 关系
- `src/renderer/stores/agentSessions.ts`
  增加 global stale 标记

## 测试策略

### Shared / Main

- resolver 测试覆盖：
  global allow
  global block
  project override global
  worktree override project
  stable hash

### Renderer

- storage 测试覆盖 global policy 读写
- settings 页面测试覆盖 global 入口与 editor 打开
- repo menu 测试覆盖 `Project Policy` 入口
- stale notice 测试覆盖 global stale 标记路径
- launch metadata 测试覆盖 global policy 注入

## 风险与控制

### 风险 1

全局设置页从只读 catalog 升级为 policy 页面，可能影响现有 source-based test。

控制：

- 尽量保留现有 catalog section 结构
- 新增 global summary 放在页头，不重写整页布局

### 风险 2

global scope 引入后，preview 和 launch contract 容易在 main/preload/renderer 之间漂移。

控制：

- 先改 shared types
- 再同步 main IPC
- 最后改 renderer call sites

### 风险 3

stale 标记范围扩大后，容易误伤非 Claude session。

控制：

- 延续现有 `agentCommand.startsWith('claude')`
- 仅对带 `claudePolicyHash` 的 session 生效

## 验收标准

- 用户可以在全局设置打开 `Global Policy` 编辑器
- 用户可以在仓库菜单直接打开 `Project Policy`
- 用户可以在 worktree 菜单打开 `Worktree Policy`
- 三个 editor 都是统一的列表式配置弹窗
- 列表项支持 `Inherit / Enabled / Disabled`
- 保存后对应 scope 的 Claude session 被标记 stale
- Claude 新 session 启动使用四层解析结果
- `pnpm test`
- `pnpm typecheck`
- `pnpm lint`

