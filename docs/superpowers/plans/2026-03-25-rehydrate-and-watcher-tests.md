# Rehydrate And Watcher Lifecycle Tests Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a third batch of regression tests covering settings rehydration side effects and file watcher lifecycle cleanup.

**Architecture:** Exercise existing modules through controlled mocks instead of introducing large new abstractions. For renderer settings, trigger explicit rehydration and verify side effects. For file watchers, register the real IPC handlers against mocked Electron and FileWatcher collaborators, then drive lifecycle operations through the handler surface.

**Tech Stack:** TypeScript, Vitest, module mocks, fake DOM globals, Electron IPC doubles

---

## Chunk 1: Settings Rehydrate Safety

### Task 1: Cover persisted settings rehydrate side effects

**Files:**
- Create: `src/renderer/stores/settings/__tests__/rehydrate.test.ts`
- Reference: `src/renderer/stores/settings/index.ts`

- [ ] Step 1: Write failing tests for rehydrate applying language, proxy, Web Inspector, git auto-fetch, and renderer logging side effects.
- [ ] Step 2: Write failing tests for Windows shell auto-detection running only on first rehydrate.
- [ ] Step 3: Run `corepack pnpm test -- rehydrate` and confirm red/green cycle.

## Chunk 2: File Watcher Lifecycle Safety

### Task 2: Cover watcher start, owner cleanup, and directory stop behavior

**Files:**
- Create: `src/main/ipc/__tests__/files.watchers.test.ts`
- Reference: `src/main/ipc/files.ts`

- [ ] Step 1: Write failing tests for local watcher startup and owner-destroy cleanup.
- [ ] Step 2: Write failing tests for stopping all watchers under a directory subtree.
- [ ] Step 3: Run `corepack pnpm test -- files.watchers` and confirm red/green cycle.

## Verification

- [ ] Run `corepack pnpm test`
- [ ] Run `corepack pnpm exec tsc --noEmit`
- [ ] Run `corepack pnpm exec biome check .`
