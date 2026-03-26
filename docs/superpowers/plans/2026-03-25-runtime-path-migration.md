# Runtime Path Migration Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move all active runtime paths from EnsoAI naming to Infilux naming and keep `~/.ensoai` only as a manual import source.

**Architecture:** Introduce shared path constants for managed state roots, default workspace directories, temp input directories, cache filenames, and log prefixes. Update main-process services and renderer defaults to consume the same constants so runtime behavior is consistent across platforms and no active code path still writes to `~/.ensoai` or `~/ensoai/*`.

**Tech Stack:** TypeScript, Electron, React, Vitest, Biome

---

### Task 1: Centralize runtime path constants

**Files:**
- Create: `src/shared/paths.ts`
- Modify: `src/shared/branding.ts`

- [ ] Define managed and legacy state directory names.
- [ ] Define default workspace directory segments for repos, worktrees, and temporary sessions.
- [ ] Define temp input, permission probe, remote runtime, cache, and log file naming constants.

### Task 2: Write failing tests for the new runtime path behavior

**Files:**
- Modify: `src/main/services/__tests__/SharedSessionState.test.ts`
- Modify: `src/main/ipc/__tests__/tempWorkspace.test.ts`
- Modify: `src/main/ipc/__tests__/files.handlers.test.ts`
- Modify: `src/main/__tests__/index.test.ts`
- Modify: `src/main/utils/__tests__/logger.test.ts`
- Create: `src/renderer/lib/__tests__/gitClone.test.ts`

- [ ] Update shared state tests to expect `~/.infilux`.
- [ ] Update temp workspace tests to expect `~/infilux/temporary` and `.infilux-permission-*`.
- [ ] Update temp input tests to expect `infilux-input`.
- [ ] Update logger tests to expect `infilux-*.log`.
- [ ] Add renderer git clone tests for `~/infilux/repos`.

### Task 3: Update main-process runtime paths

**Files:**
- Modify: `src/main/services/SharedSessionState.ts`
- Modify: `src/main/ipc/tempWorkspace.ts`
- Modify: `src/main/ipc/files.ts`
- Modify: `src/main/index.ts`
- Modify: `src/main/services/remote/RemoteAuthBroker.ts`
- Modify: `src/main/services/remote/RemoteRuntimeAssets.ts`
- Modify: `src/main/services/remote/RemoteHelperSource.ts`
- Modify: `src/main/services/remote/RemoteConnectionManager.ts`
- Modify: `src/main/services/claude/ClaudeCompletionsManager.ts`
- Modify: `src/main/utils/logger.ts`

- [ ] Replace active `.ensoai` runtime roots with `.infilux`.
- [ ] Replace `ensoai-input` temp directories with `infilux-input`.
- [ ] Replace active log and cache filenames with `infilux-*`.
- [ ] Leave legacy hook markers untouched because they are compatibility identifiers, not runtime storage paths.

### Task 4: Update renderer defaults and user-facing path hints

**Files:**
- Modify: `src/renderer/lib/gitClone.ts`
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/components/worktree/CreateWorktreeDialog.tsx`
- Modify: `src/renderer/components/settings/GeneralSettings.tsx`
- Modify: `src/renderer/components/settings/RemoteSettings.tsx`
- Modify: `src/shared/i18n.ts`

- [ ] Replace default `~/ensoai/*` fallbacks with `~/infilux/*`.
- [ ] Keep the manual import section referencing `~/.ensoai/settings.json` because that is the legacy import source.
- [ ] Update translated copy for the new default directories.

### Task 5: Verify the migration

**Files:**
- Modify: `src/renderer/lib/__tests__/gitClone.test.ts`

- [ ] Run focused Vitest suites for shared state, temp workspace, files handlers, logger, main startup, and git clone defaults.
- [ ] Run targeted Biome checks on changed files.
- [ ] Run `pnpm typecheck` and record unrelated pre-existing failures if they remain.
