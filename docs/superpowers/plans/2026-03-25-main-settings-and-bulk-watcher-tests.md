# Main Settings And Bulk Watcher Tests Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a fourth batch of regression tests for main-process settings write scheduling and file watcher bulk flush behavior.

**Architecture:** Exercise the existing main-process modules through mocked Electron registration points. Validate timing-sensitive behavior with fake timers so debounce, max-wait flush, and bulk sentinel emission remain stable without restructuring production code.

**Tech Stack:** TypeScript, Vitest, fake timers, Electron IPC mocks

---

## Chunk 1: Main Settings Write Safety

### Task 1: Cover settings write scheduling and flush semantics

**Files:**
- Create: `src/main/ipc/__tests__/settings.test.ts`
- Reference: `src/main/ipc/settings.ts`

- [ ] Step 1: Write failing tests for debounced writes keeping only the latest payload.
- [ ] Step 2: Write failing tests for max-wait flushing and before-quit forced flush.
- [ ] Step 3: Write failing tests for Claude provider watcher toggle semantics.
- [ ] Step 4: Run `corepack pnpm test -- settings.test` and confirm red/green cycle.

## Chunk 2: Bulk Watcher Flush Safety

### Task 2: Cover file watcher event flush modes

**Files:**
- Modify: `src/main/ipc/__tests__/files.watchers.test.ts`
- Reference: `src/main/ipc/files.ts`

- [ ] Step 1: Write failing tests for normal event flush sending individual file change events.
- [ ] Step 2: Write failing tests for overflow switching to `.enso-bulk` sentinel mode.
- [ ] Step 3: Run `corepack pnpm test -- files.watchers` and confirm red/green cycle.

## Verification

- [ ] Run `corepack pnpm test`
- [ ] Run `corepack pnpm exec tsc --noEmit`
- [ ] Run `corepack pnpm exec biome check .`
