# Agent Input Scroll Recovery Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Deliver agent input after a missing tmux host falls back to a hostless session, without repeating failure notifications.

**Architecture:** Keep the scroll controller bound to the launch parameters actually selected for the current session. Clear obsolete scroll work before fallback creation, and share sequence-aware failure reporting between copy-mode cancellation and IPC writes. An unconfirmed copy-mode exit must still block input to a real tmux host.

**Tech Stack:** React, TypeScript, Electron IPC, xterm.js, Vitest, Playwright.

---

Scope: implement in the current workspace as requested. Do not commit, restart the installed application, or send input to user-owned sessions.

### Task 1: Reproduce the regression

**Status:** Complete. All four initial regression tests failed for the expected input-blocking and notification-count reasons before implementation. Coverage also includes local and remote paths, parent rerenders, and surface hibernation.

**Files:**
- Modify: `src/renderer/hooks/__tests__/useXterm.test.ts`

1. Add fallback tests with and without a parent rerender. Force the old host's bottom request to return `{ applied: false }`, reject primary creation with a missing-host error, and assert queued and subsequent input reaches the fallback session exactly once.
2. Add repeated copy-mode failure and mixed IPC failure tests. Assert unknown copy-mode state still blocks input, reports once per failure episode, and a confirmed successful send re-enables notification.
3. Run the focused tests and confirm failures reflect the missing lifecycle cleanup and notification deduplication.

Run: `env NODE_OPTIONS=--no-experimental-webstorage pnpm --config.manage-package-manager-versions=false exec vitest run src/renderer/hooks/__tests__/useXterm.test.ts --maxWorkers 2 --silent`

### Task 2: Correct the binding and error lifecycle

**Status:** Complete. The actual host context is updated before fallback callbacks, retained across surface disposal, and cleared on session reset. Copy-mode and IPC input failures share sequence-aware notification handling.

**Files:**
- Modify: `src/renderer/hooks/useXterm.ts`

1. Record the selected session host context for each initialization request and update it synchronously before fallback creation.
2. Cancel pending scroll work and dispose controllers that no longer match the selected host. Resolve wheel ownership and input gating from that context, including while parent props remain stale.
3. Allocate input sequence numbers before history-mode cancellation and share failure reporting with IPC delivery. Preserve current-session guards, privacy-safe logging, and newer-success reset semantics.
4. Run the hook and controller tests; retain valid-host copy-mode serialization coverage.

### Task 3: Verify runtime behavior

**Status:** Complete. 433 focused unit/integration tests and four isolated Electron scenarios passed. Typecheck, full lint, build, and independent read-only review passed. Changes remain uncommitted; the installed application was not restarted or replaced.

**Files:**
- Modify if needed: `e2e/agent-wheel-scroll.test.ts`
- Reuse: `e2e/helpers/agentWheelProbeScenario.ts`

1. Reproduce a missing host with an isolated fake agent and verify typed input reaches the fallback process without failure toasts.
2. Run valid-host scrolling/input scenarios to confirm input still waits for a verified copy-mode exit.
3. Run `pnpm --config.manage-package-manager-versions=false typecheck` and focused Biome checks, review the final diff, and report verification results. Leave changes uncommitted.

Electron verification command:

```bash
env NODE_OPTIONS=--no-experimental-webstorage pnpm --config.manage-package-manager-versions=false exec vitest run --config vitest.e2e.config.ts e2e/agent-wheel-scroll.test.ts -t 'missing tmux host|managed tmux history|native agent mouse' --maxWorkers 1
```

The missing-host scenario removes only the fixture's unique tmux session through the isolated app's original IPC handler. It waits for a real unconfirmed recovery exit before allowing creation to fail, then asserts both `TEXT` and `ECHO` markers for two successive keyboard inputs, local scroll ownership, and no input failure logs or toasts.
