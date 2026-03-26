# Settings And File Helper Tests Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a second batch of high-risk regression tests around settings migration/storage and file IPC helper logic.

**Architecture:** Cover deterministic pure logic first. Test settings migration and storage behavior directly, and extract file IPC helper utilities into a dedicated pure module so encoding and path safety rules can be tested without Electron watcher setup.

**Tech Stack:** TypeScript, Vitest, Zustand persist adapter patterns, Node Buffer helpers

---

## Chunk 1: Settings Persistence Safety

### Task 1: Cover settings migration edge cases

**Files:**
- Create: `src/renderer/stores/settings/__tests__/migration.test.ts`
- Reference: `src/renderer/stores/settings/migration.ts`

- [ ] Step 1: Write failing tests for background numeric clamping and legacy background URL migration.
- [ ] Step 2: Write failing tests for legacy xterm keybinding migration and disabled agent filtering.
- [ ] Step 3: Write failing tests for Claude enhanced input auto-popup migration behavior.
- [ ] Step 4: Run `corepack pnpm test -- migration` and confirm red/green cycle.

### Task 2: Cover settings storage adapter behavior

**Files:**
- Create: `src/renderer/stores/settings/__tests__/storage.test.ts`
- Reference: `src/renderer/stores/settings/storage.ts`

- [ ] Step 1: Write failing tests for `getItem()` serializing a named persisted slice.
- [ ] Step 2: Write failing tests for `setItem()` merge semantics and `removeItem()` deletion semantics.
- [ ] Step 3: Run `corepack pnpm test -- storage` and confirm red/green cycle.

## Chunk 2: File IPC Pure Helper Safety

### Task 3: Extract and cover file helper rules

**Files:**
- Create: `src/main/ipc/__tests__/fileUtils.test.ts`
- Create: `src/main/ipc/fileUtils.ts`
- Modify: `src/main/ipc/files.ts`

- [ ] Step 1: Write failing tests for encoding normalization and BOM-based encoding detection.
- [ ] Step 2: Write failing tests for batch conflict target path validation and remote/local watcher path normalization.
- [ ] Step 3: Implement the helper module and wire `files.ts` to reuse it.
- [ ] Step 4: Run `corepack pnpm test -- fileUtils` and confirm green.

## Verification

- [ ] Run `corepack pnpm test`
- [ ] Run `corepack pnpm exec tsc --noEmit`
- [ ] Run `corepack pnpm exec biome check .`
