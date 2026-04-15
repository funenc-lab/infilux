# Global / Project / Worktree Claude Policy Entry Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 扩展现有 Claude policy 为 `global -> project -> worktree` 三层可配置体系，并在全局设置、项目菜单、worktree 菜单提供统一入口。

**Architecture:** 复用现有 catalog、policy editor、policy resolver、session stale 流程，在 shared contract 和 renderer storage 中增加 global scope，再把 resolver 和统一编辑器扩展为四层解析。UI 不新增并行系统，只升级现有 Claude 页面和菜单入口。

**Tech Stack:** Electron, React, TypeScript, Zustand, Vitest, renderer localStorage persistence

---

## Chunk 1: Shared Contracts And Failing Tests

**Files:**
- Modify: `src/shared/types/claudePolicy.ts`
- Modify: `src/shared/types/ipc.ts`
- Modify: `src/shared/types/index.ts`
- Modify: `src/main/services/claude/__tests__/ClaudePolicyResolver.test.ts`
- Modify: `src/main/ipc/__tests__/claudePolicy.test.ts`
- Modify: `src/renderer/components/chat/__tests__/claudePolicyLaunch.test.ts`

- [ ] 写 resolver 和 launch contract 的失败测试，覆盖 `globalPolicy`
- [ ] 运行聚焦测试，确认因缺少 global scope 失败
- [ ] 在 shared types 中加入 `ClaudeGlobalPolicy`、`globalPolicy` request 字段、`global-policy` provenance
- [ ] 跑聚焦测试，确认 shared contract 已接通

## Chunk 2: Storage And Global Stale Model

**Files:**
- Modify: `src/renderer/App/storage.ts`
- Modify: `src/renderer/stores/agentSessions.ts`
- Modify: `src/renderer/components/chat/__tests__/sessionPolicyStaleNotice.test.ts`
- Create: `src/renderer/App/__tests__/claudeGlobalPolicyStorage.test.ts`

- [ ] 先写 global policy storage 的失败测试
- [ ] 运行测试并确认失败原因正确
- [ ] 增加 global policy localStorage key、getter、setter
- [ ] 增加 `markClaudePolicyStaleGlobally`
- [ ] 跑聚焦测试确认通过

## Chunk 3: Main Runtime Resolution

**Files:**
- Modify: `src/main/services/claude/ClaudePolicyResolver.ts`
- Modify: `src/main/services/claude/ClaudeSessionLaunchPreparation.ts`
- Modify: `src/main/ipc/claudePolicy.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/main/services/claude/__tests__/ClaudePolicyResolver.test.ts`
- Modify: `src/main/ipc/__tests__/claudePolicy.test.ts`

- [ ] 先让 resolver 测试覆盖 global allow/block 与优先级
- [ ] 运行测试并确认失败
- [ ] 扩展 resolver 使用 `catalog -> global -> project -> worktree`
- [ ] 扩展 IPC / preload / launch prepare 透传 `globalPolicy`
- [ ] 跑聚焦测试确认主流程通过

## Chunk 4: Unified Editor And Settings Entry

**Files:**
- Modify: `src/renderer/components/settings/constants.ts`
- Modify: `src/renderer/components/settings/SettingsShell.tsx`
- Modify: `src/renderer/components/settings/claude-policy/ClaudePolicyEditorDialog.tsx`
- Modify: `src/renderer/components/settings/claude-policy/model.ts`
- Modify: `src/renderer/components/settings/claude-policy/ClaudeCapabilityCatalogSection.tsx`
- Modify: `src/renderer/components/settings/claude-policy/__tests__/ClaudePolicyEditorDialog.test.ts`
- Create: `src/renderer/components/settings/claude-policy/__tests__/ClaudeGlobalPolicySection.test.ts`

- [ ] 先写全局设置入口与 global editor 的失败测试
- [ ] 运行测试并确认失败
- [ ] 将 `Claude Catalog` 升级为带 `Global Policy` summary 的全局页面
- [ ] 统一 editor 支持 `scope = global | project | worktree`
- [ ] 将决策文案对齐为 `Inherit / Enabled / Disabled`
- [ ] 跑聚焦测试确认通过

## Chunk 5: Project / Worktree Menu Entry

**Files:**
- Modify: `src/renderer/components/layout/TreeSidebar.tsx`
- Modify: `src/renderer/components/repository/RepositorySettingsDialog.tsx`
- Modify: `src/renderer/components/layout/tree-sidebar/WorktreeTreeItem.tsx`
- Modify: `src/renderer/components/repository/__tests__/RepositorySettingsDialog.test.ts`
- Create: `src/renderer/components/layout/__tests__/treeSidebarPolicyEntry.test.ts`

- [ ] 先写 repo menu `Project Policy` 入口失败测试
- [ ] 运行测试并确认失败
- [ ] 在 repo menu 新增 `Project Policy`
- [ ] 保持 worktree menu 继续通过统一 editor 打开
- [ ] repository settings summary 接入 global/project preview 关系
- [ ] 跑聚焦测试确认通过

## Chunk 6: Launch Metadata And Global Scope End-To-End

**Files:**
- Modify: `src/renderer/components/chat/claudePolicyLaunch.ts`
- Modify: `src/renderer/components/chat/AgentPanel.tsx`
- Modify: `src/renderer/hooks/useXterm.ts`
- Modify: `src/renderer/components/chat/__tests__/claudePolicyLaunch.test.ts`

- [ ] 写 global policy 注入的失败测试
- [ ] 运行测试并确认失败
- [ ] 在 launch metadata 中带上 `globalPolicy`
- [ ] 保持 session metadata 回写与 stale notice 兼容
- [ ] 跑聚焦测试确认通过

## Chunk 7: Verification

**Files:**
- Verify only

- [ ] 运行受影响聚焦测试
- [ ] 运行 `pnpm test`
- [ ] 运行 `pnpm typecheck`
- [ ] 运行 `pnpm lint`
- [ ] 检查 i18n 覆盖和 source-based policy tests

Plan complete and saved to `docs/superpowers/plans/2026-04-11-global-project-worktree-claude-policy-entry.md`. Ready to execute?
