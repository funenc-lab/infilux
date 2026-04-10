# 项目 / Worktree Skill 与 MCP 策略设计

> 日期：2026-04-10  
> 项目：Infilux / EnsoAI  
> 范围：为项目与 worktree 增加 Claude 能力与 MCP 的策略控制，并提供全局只读能力总览

---

## 1. 目标

为 Infilux 增加一套清晰的三层能力管理模型：

1. 全局层只读展示“系统全部可发现能力”
2. 项目层可配置项目默认策略
3. worktree 层可配置 worktree 覆盖策略

本次设计覆盖的能力范围包括：

- Claude project/shared subagents
- Claude project/shared slash commands
- 现有项目中已支持的 legacy skills 发现结果
- MCP server 配置与启用控制

最终目标行为：

1. 用户可以在全局界面查看系统当前全部可发现能力与来源
2. 用户可以在 repository settings 中配置项目默认能力策略
3. 用户可以在 worktree 上下文中配置 worktree 覆盖策略
4. Agent session 启动前按项目与 worktree 策略生成 effective config
5. 运行中的 session 不热更新策略，策略变化后仅标记为 stale 并提示重启

---

## 2. 非目标

本次不做以下内容：

- 不新增“全局可配置策略”这一层
- 不在第一版 UI 中暴露 profile / template 复用体系
- 不把现有全局 `settings` store 改造成项目策略存储
- 不在运行中的 Claude session 上做热更新注入
- 不尝试强制隔离用户整机所有全局个人能力
- 不把 prompts、plugins、provider 配置一起并入同一套策略系统

---

## 3. 用户确认后的产品语义

用户已确认最终语义为：

1. **全局可查看系统全部的**
   - 全局页面只读
   - 负责“看全貌”和排查来源

2. **项目可配置**
   - 项目层定义默认策略
   - 作为该项目全部 worktree 的基线

3. **worktree 可配置**
   - worktree 层在项目基线之上做覆盖
   - 适用于实验分支、发布修复、特殊开发环境

因此第一版正式解析链为：

`Global Catalog (read-only discovery)`  
-> `Project Policy (configurable baseline)`  
-> `Worktree Policy (configurable override)`  
-> `Effective Runtime`

其中：

- `Global Catalog` 不参与运行时优先级计算
- `Project Policy` 与 `Worktree Policy` 才是实际策略输入

---

## 4. 当前现状与约束

### 4.1 现有代码边界

当前仓库里与 Claude 相关的能力主要分散在以下模块：

- `src/main/services/claude/`
  - `McpManager.ts`
  - `PromptsManager.ts`
  - `ClaudeProviderManager.ts`
  - `ClaudeCompletionsManager.ts`
  - `ClaudeWorkspaceTrust.ts`
- `src/main/ipc/claudeConfig.ts`
- `src/main/ipc/claudeCompletions.ts`
- `src/renderer/components/settings/IntegrationSettings.tsx`
- `src/renderer/components/settings/mcp/McpSection.tsx`
- `src/renderer/components/settings/prompts/PromptsSection.tsx`
- `src/renderer/App/storage.ts`

当前问题在于：

1. 现有 MCP / prompt / completions 更偏向全局或远端环境文件操作
2. repository settings 只覆盖隐藏、worktree 初始化等轻量配置
3. worktree 没有独立的策略配置模型
4. 全局 settings store 不适合承载按项目 / worktree 生效的策略解析

### 4.2 Claude Code 当前作用域语义

结合当前官方文档与现有仓库实现，第一版实现需要尊重以下对象边界：

- 项目共享 settings：`.claude/settings.json`
- 项目本地 settings：`.claude/settings.local.json`
- 项目共享 subagents：`.claude/agents/`
- 项目共享 slash commands：`.claude/commands/`
- 项目共享 MCP：`.mcp.json`
- 用户作用域项目状态 / local MCP 仍需走用户侧 Claude 项目配置路径

这意味着产品文案可以继续沿用“skill + MCP”，但内部实现不应把“skill”硬编码成单一目录。

---

## 5. 方案比较

### 方案 A：继续扩展全局 settings UI

做法：

- 在 `IntegrationSettings` / `McpSection` 基础上继续叠加项目与 worktree 策略

优点：

- 改动入口少

缺点：

- 混淆全局集成配置与项目运行策略
- `IntegrationSettings.tsx` 复杂度会继续膨胀
- worktree 语义不自然

### 方案 B：全局只读目录 + 项目策略 + worktree 策略（推荐）

做法：

- 新增只读全局 catalog
- 在 repository settings 增加项目策略入口
- 在 worktree 上下文增加 worktree 策略入口
- 新增独立 resolver / projector

优点：

- 语义与用户确认完全一致
- 边界清晰
- 后续可扩展

缺点：

- 需要引入新的领域模型与 UI surface

### 方案 C：profile-first

做法：

- 一开始就把所有配置都暴露为 profile 绑定

优点：

- 长期复用能力强

缺点：

- 第一版心智复杂
- 与当前用户表达的“项目可配置、worktree 可配置、全局只读”不一致

**结论：采用方案 B。**

---

## 6. 核心设计

### 6.1 统一能力抽象

第一版统一抽象一个 `capability` 概念，覆盖：

- `subagent`
- `command`
- `legacy-skill`
- `mcp`

说明：

- UI 层可以继续显示“Skills & MCP”这类产品文案
- 领域模型中统一称为 capability，避免与单一目录或单一文件格式绑定

### 6.2 三层模型

#### 6.2.1 Global Catalog

只读发现目录，用于展示系统全部当前可发现能力。

需要展示：

- ID
- 名称
- 类型
- 来源作用域
- 来源路径
- 当前是否可用
- 是否支持策略控制

来源需要至少支持：

- system
- user
- project
- worktree
- remote

#### 6.2.2 Project Policy

项目默认策略，按 repository path 存储。

第一版策略形式使用显式 allow / block：

- `allowedCapabilityIds`
- `blockedCapabilityIds`
- `allowedSharedMcpIds`
- `blockedSharedMcpIds`
- `allowedPersonalMcpIds`
- `blockedPersonalMcpIds`

#### 6.2.3 Worktree Policy

worktree 覆盖策略，按 `repoPath + worktreePath` 存储。

需要包含：

- 是否继承项目策略
- worktree 级 allow / block 集合
- 更新时间

### 6.3 优先级规则

第一版优先级规则固定为：

1. 以 catalog 作为候选能力全集
2. 先应用 project policy
3. 再应用 worktree policy
4. `block` 始终高于 `allow`
5. worktree 未配置时完全继承 project policy

因此 effective config 解析公式为：

`catalog + project policy + worktree policy -> effective config`

### 6.4 运行时落地点

策略本身不是运行时文件，运行时文件只是 projection 结果。

#### 本地工作区 / worktree

projector 需要按 effective config 写入目标 workspace root：

- `.claude/agents/`
- `.claude/commands/`
- `.mcp.json`
- 仅在确有项目本地设置需求时写入 `.claude/settings.local.json`

约束：

- 不把 local MCP 误写到 `.claude/settings.local.json`

#### 远端工作区 / worktree

复用同一套 resolver，仅替换为 remote projector：

- 写入远端工作区的 `.claude/agents/`
- 写入远端工作区的 `.claude/commands/`
- 写入远端工作区的 `.mcp.json`
- 仅在确有项目本地设置需求时同步远端 `.claude/settings.local.json`

#### 用户作用域项目状态 / local MCP

对于用户作用域的项目状态、批准信息与 local MCP：

- 不应误写成项目目录文件
- 应沿用用户作用域 Claude 项目配置通路
- 当前仓库已有 `ClaudeWorkspaceTrust.ts` 使用 `.claude.json -> projects[workspacePath]`
  的路径，第一版可以继续沿这条作用域路径扩展 adapter

### 6.5 Session 生命周期

Agent session 启动链路固定为：

1. 解析当前 `repoPath + worktreePath` 的 effective config
2. 计算 effective config hash
3. 若目标 runtime 未同步或 hash 变更，则先执行 projection
4. projection 成功后，将 `configHash`、`scopeSource`、`projectedAt` 写入 session metadata
5. 启动 session

运行中的 session 遇到策略变化时：

- 不热更新
- 仅标记 `stale-config`
- 在 UI 提示用户重启 session

---

## 7. 模块边界

### 7.1 CapabilityCatalogService

职责：

- 发现所有 Claude capability
- 归一化成系统内部的统一 catalog 项
- 打来源标签

不负责：

- 项目 / worktree 策略解析
- 运行时文件写入

### 7.2 ClaudePolicyStore

职责：

- 持久化 project policy
- 持久化 worktree policy

不负责：

- 发现 catalog
- 运行时投影

### 7.3 ClaudePolicyResolver

职责：

- 输入 catalog、project policy、worktree policy
- 输出 effective config、来源链、hash、projection plan

建议：

- 尽量做成纯函数
- 单独提供可测的归一化与优先级逻辑

### 7.4 ClaudeRuntimeProjector

职责：

- 将 effective config 写入本地或远端目标运行环境
- 基于 hash 做重复投影去重

子职责：

- local projector
- remote projector
- user-scope project adapter

### 7.5 PolicyEditor UI

职责：

- 全局只读 catalog 页面
- 项目策略编辑
- worktree 策略编辑
- effective preview
- stale session banner

---

## 8. 数据契约

建议新增：

- `src/shared/types/claudePolicy.ts`

核心类型建议如下。

### 8.1 `ClaudeCapabilityKind`

```text
subagent | command | legacy-skill | mcp
```

### 8.2 `ClaudeCapabilityCatalogItem`

建议字段：

- `id`
- `kind`
- `name`
- `description?`
- `sourceScope`
- `sourcePath?`
- `isAvailable`
- `isConfigurable`
- `transportType?`（MCP 专用）

### 8.3 `ClaudeProjectPolicy`

建议字段：

- `repoPath`
- `allowedCapabilityIds`
- `blockedCapabilityIds`
- `allowedSharedMcpIds`
- `blockedSharedMcpIds`
- `allowedPersonalMcpIds`
- `blockedPersonalMcpIds`
- `updatedAt`

### 8.4 `ClaudeWorktreePolicy`

建议字段：

- `repoPath`
- `worktreePath`
- `inheritsProjectPolicy`
- `allowedCapabilityIds`
- `blockedCapabilityIds`
- `allowedSharedMcpIds`
- `blockedSharedMcpIds`
- `allowedPersonalMcpIds`
- `blockedPersonalMcpIds`
- `updatedAt`

### 8.5 `ResolvedClaudePolicy`

建议字段：

- `repoPath`
- `worktreePath`
- `capabilities`
- `sharedMcpServers`
- `personalMcpServers`
- `provenance`
- `hash`

### 8.6 `ClaudeRuntimeProjectionResult`

建议字段：

- `hash`
- `applied`
- `updatedFiles`
- `warnings`
- `errors`

---

## 9. UI 与交互

### 9.1 Global Catalog

新增一个全局只读页面，例如：

- `Claude Capability Catalog`

它只负责：

- 展示系统全部可发现能力
- 支持搜索、筛选、来源分组
- 帮助用户理解“当前系统到底有哪些能力”

它不负责：

- 编辑项目或 worktree 策略

### 9.2 Repository Settings

在现有 [RepositorySettingsDialog.tsx](/Users/tanzv/infilux/workspaces/EnsoAI/feat/skill-mcp/src/renderer/components/repository/RepositorySettingsDialog.tsx)
中新增轻量摘要区块：

- 当前项目策略摘要
- 当前允许 / 禁止数量
- effective preview 简要计数
- `Edit Policy` 入口

不建议把完整编辑器直接塞进该对话框。

### 9.3 Worktree Settings

在 worktree 上下文菜单中增加：

- `Worktree Policy`

该入口打开独立编辑器或共享 policy editor surface。

### 9.4 Policy Editor

建议统一为单独编辑器，而不是 scattered inline controls。

固定四块：

1. `Scope Summary`
   - 当前是 project 还是 worktree
   - repo/worktree 标识

2. `Capabilities`
   - subagents
   - commands
   - legacy skills

3. `MCP`
   - shared project MCP
   - personal project MCP

4. `Effective Preview`
   - 最终生效列表
   - 来源链
   - 将写入哪些运行时文件
   - 当前 session 是否 stale

### 9.5 Stale Session 提示

当 project/worktree 策略修改后，如果当前 worktree 仍有运行中的 agent session：

- 显示 `Policy changed. Restart sessions to apply.`
- 提供 worktree 级重启快捷动作

---

## 10. 持久化策略

### 10.1 Project Policy

建议扩展现有 repository local storage 体系，而不是写入全局 settings store。

原因：

- repository settings 本身就是 repo-scope 数据
- 不会污染全局偏好 store
- 迁移成本较低

### 10.2 Worktree Policy

新增 per-repo/per-worktree 映射存储。

原因：

- worktree 不是全局偏好
- 需要与 repoPath 组合定位
- 删除 worktree 后需要支持清理

### 10.3 Global Catalog

catalog 优先走实时发现，不作为主持久化数据源。

必要时可以增加短期缓存，但缓存只是性能优化，不应成为 source of truth。

---

## 11. 错误处理

### 11.1 Catalog Errors

例如：

- 某个目录不可读
- 远端 catalog 拉取失败
- 某种能力 discovery 失败

处理方式：

- UI 局部 warning
- 允许其他目录结果继续展示

### 11.2 Policy Errors

例如：

- policy 中引用不存在的 capability ID
- worktree policy 指向不存在 worktree
- 存储数据损坏

处理方式：

- 在编辑器显式标红或自动修复
- 不静默吞掉

### 11.3 Projection Errors

例如：

- 目标文件不可写
- 远端同步失败
- 目标路径不存在且无法创建

处理方式：

- 阻断 session 启动
- 返回结构化错误
- 不能静默降级后继续启动

---

## 12. 测试策略

第一版至少覆盖以下测试层。

### 12.1 Resolver 单测

覆盖：

- 仅 project policy
- project + worktree override
- allow / block 冲突
- 缺失 capability ID
- shared MCP / personal MCP 分离
- hash 稳定性

### 12.2 Policy Storage 单测

覆盖：

- project policy 读写
- worktree policy 读写
- 删除 worktree 后清理
- 兼容旧数据

### 12.3 Projector 单测

覆盖：

- 本地投影
- 远端投影
- hash 未变时跳过
- 投影失败结构化返回

### 12.4 UI 单测

覆盖：

- 全局 catalog 只读展示
- repository settings 摘要正确
- worktree policy 继承 / 覆盖切换
- effective preview 来源显示
- stale session banner

---

## 13. 影响文件与新增模块建议

### 13.1 现有文件

- [src/renderer/App/storage.ts](/Users/tanzv/infilux/workspaces/EnsoAI/feat/skill-mcp/src/renderer/App/storage.ts)
  - 扩展 repo/worktree policy 存储

- [src/renderer/components/repository/RepositorySettingsDialog.tsx](/Users/tanzv/infilux/workspaces/EnsoAI/feat/skill-mcp/src/renderer/components/repository/RepositorySettingsDialog.tsx)
  - 增加项目策略摘要与入口

- [src/renderer/components/layout/TreeSidebar.tsx](/Users/tanzv/infilux/workspaces/EnsoAI/feat/skill-mcp/src/renderer/components/layout/TreeSidebar.tsx)
  - 增加 worktree policy 入口

- [src/main/services/claude/ClaudeCompletionsManager.ts](/Users/tanzv/infilux/workspaces/EnsoAI/feat/skill-mcp/src/main/services/claude/ClaudeCompletionsManager.ts)
  - 可复用部分 discovery 逻辑

- [src/main/ipc/claudeCompletions.ts](/Users/tanzv/infilux/workspaces/EnsoAI/feat/skill-mcp/src/main/ipc/claudeCompletions.ts)
  - 可复用远端 discovery 逻辑

- [src/main/services/remote/RemoteEnvironmentService.ts](/Users/tanzv/infilux/workspaces/EnsoAI/feat/skill-mcp/src/main/services/remote/RemoteEnvironmentService.ts)
  - 扩展 remote projector 所需写入能力

- [src/main/services/claude/ClaudeWorkspaceTrust.ts](/Users/tanzv/infilux/workspaces/EnsoAI/feat/skill-mcp/src/main/services/claude/ClaudeWorkspaceTrust.ts)
  - 可复用用户作用域项目配置路径

### 13.2 建议新增

- `src/shared/types/claudePolicy.ts`
- `src/main/services/claude/CapabilityCatalogService.ts`
- `src/main/services/claude/ClaudePolicyResolver.ts`
- `src/main/services/claude/ClaudeRuntimeProjector.ts`
- `src/main/ipc/claudePolicy.ts`
- `src/renderer/components/settings/claude-policy/`

---

## 14. 扩展点

未来可在不破坏第一版模型的前提下增加：

1. Profile / template 复用
2. Project policy 导入导出
3. Worktree 一键复制项目策略并改写
4. Policy diff
5. 更严格的用户全局能力隔离模式

第一版不暴露这些能力，但设计需保留演进空间。

---

## 15. 假设

本次设计按以下假设落地：

1. 用户所说“全局可查看系统全部的”是只读 catalog，不是第三层可配置策略
2. 第一版优先做 project/worktree 级 allow / block，不做 profile UI
3. 运行中的 session 不接受热更新，统一通过 stale + restart 处理
4. legacy skills 仍需要兼容，但不应主导整体能力模型命名
5. user-scope local MCP 与 project-shared MCP 需要通过不同 adapter 写入

---

## 16. 实施顺序建议

建议分三步实施：

1. 先完成 shared types、policy storage、resolver
2. 再完成 local/remote projector 与 session 启动接入
3. 最后完成 Global Catalog 与 project/worktree policy UI

这样可以先把运行时语义定稳，再叠加 UI。

---

## 17. 参考

- Claude Code settings
- Claude Code MCP
- Claude Code subagents
- Claude Code slash commands

这些作用域语义已在本设计中作为当前实现前提使用；若官方语义后续变化，应优先调整
projector 与 catalog adapter，而不是破坏 project/worktree policy 领域模型。
