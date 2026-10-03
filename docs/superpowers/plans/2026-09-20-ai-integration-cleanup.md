# AI 集成设置清理实施计划

## 目标

减少 AI 设置中的重复入口和死代码，同时保留仍有真实调用链的 MCP、插件、提示词和 provider 禁用能力。第一阶段只删除可以由仓库调用图证明为无效的设置包装层，避免把仍在使用的功能误删。

## 范围与边界

### 本阶段删除

1. `src/renderer/components/settings/SettingsDialog.tsx`
   - 当前仓库没有运行时调用方。
   - 现行入口是 `DraggableSettingsWindow -> SettingsContent -> SettingsShell`。
   - 删除后移除 `src/renderer/components/settings/index.ts` 中的导出。
2. `src/renderer/components/settings/claude-provider/index.ts`
   - 仅转出 `agent-provider` 的兼容别名，仓库内没有调用方。
   - 删除该别名，避免继续暗示存在独立的 Claude provider 设置域。
3. `AgentCapabilityCoveragePanel` 及其 capability model
   - 该模型只服务于设置页的信息展示，不参与桥接、通知或 provider 运行逻辑。
   - 删除面板、模型和仅覆盖它们的测试，移除对应的 capability 注释文案。

### 本阶段保留但不再伪装为“无效”

- `McpSection`、`PluginsSection`、`PromptsSection`：都有实际设置调用链，后续应合并到统一的 Skills & Tools 域，并修复全局/项目作用域混用。
- `ProviderList` 和 provider disable 状态：仍被设置页和会话 provider 切换器使用；本阶段不删除核心能力。
- Bridge、通知、provider watcher 等运行开关：仍由设置和主进程逻辑使用，本阶段不删除。

## 实施步骤

1. 删除两个无调用方的组件/兼容导出，并清理 settings barrel export。
2. 更新只依赖旧 `SettingsDialog` 文件存在性的结构测试，使测试验证当前设置入口，而不是保留死组件。
3. 运行设置组件相关 Vitest，再运行 `pnpm typecheck` 和 `pnpm lint`。
4. 复核 `git diff`，确保不触碰用户当前未提交的 session recovery 变更。

## 扩展点

- 后续可在 `SettingsShell` 统一注册 `Global / Project / Worktree` 作用域，并让 MCP、插件、提示词共享同一入口。
- provider profile 应以稳定的 `profileId` 被 AI action 引用，避免每个功能重复保存 provider/model 字符串。
- bridge hook 开关应由同一个运行时 enabled 条件驱动，而不是只隐藏设置项。

## 假设与风险

- 这些组件属于应用内部模块，不是被仓库外部直接导入的公共包 API。
- 如果发布流程存在未入库的外部导入，删除兼容别名会造成构建失败；验证阶段的全仓库引用扫描用于捕获这一风险。
- 本阶段不迁移用户配置，也不删除持久化字段，避免把清理任务扩大为数据迁移。
