# Read Cache And Remote Watcher Tests Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a fifth batch of regression tests for settings read-cache behavior and remote file watcher reconnect/cleanup edge cases.

**Architecture:** Reuse the existing Electron IPC mock strategy. For settings, validate module-level cache and exception fallback directly. For file watchers, extend the current watcher test harness with controllable remote-path, window, and remote-connection doubles so remote lifecycle behavior can be driven without changing production structure.

**Tech Stack:** TypeScript, Vitest, fake timers, Electron mocks, remote connection doubles

---

## Chunk 1: Settings Read Safety

### Task 1: Cover read cache and error fallback

**Files:**
- Modify: `src/main/ipc/__tests__/settings.test.ts`
- Reference: `src/main/ipc/settings.ts`

- [ ] Step 1: Write failing tests for `readSettings()` returning the cached in-memory value after the first disk read.
- [ ] Step 2: Write failing tests for `readSettings()` returning `null` when shared settings read throws.
- [ ] Step 3: Run `corepack pnpm test -- settings.test` and confirm red/green cycle.

## Chunk 2: Remote Watcher Safety

### Task 2: Cover reconnect, cleanup, and start-failure behavior for remote watchers

**Files:**
- Modify: `src/main/ipc/__tests__/files.watchers.test.ts`
- Reference: `src/main/ipc/files.ts`

- [ ] Step 1: Write failing tests for remote watcher reconnect re-registering watch start after status recovery.
- [ ] Step 2: Write failing tests for remote watcher stop/owner cleanup removing listeners and issuing best-effort watch stop.
- [ ] Step 3: Write failing tests for remote watcher registration failure cleaning up state and surfacing the error.
- [ ] Step 4: Run `corepack pnpm test -- files.watchers` and confirm red/green cycle.

## Verification

- [ ] Run `corepack pnpm test`
- [ ] Run `corepack pnpm exec tsc --noEmit`
- [ ] Run `corepack pnpm exec biome check src/main/ipc src/renderer/stores/settings vitest.config.ts`
