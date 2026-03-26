# High-Risk Core Test Coverage Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a minimum regression safety net for the highest-risk renderer navigation/editor-state flows and session lifecycle transitions.

**Architecture:** Focus on deterministic Vitest coverage around pure stores and stateful orchestration seams before introducing heavier component or E2E infrastructure. Prefer extracting tiny pure helpers only when needed to make existing behavior testable without changing runtime semantics.

**Tech Stack:** TypeScript, Vitest, Zustand, Electron service mocks

---

## Chunk 1: Renderer Navigation And Editor State

### Task 1: Cover editor worktree state switching

**Files:**
- Create: `src/renderer/stores/__tests__/editorWorktreeState.test.ts`
- Reference: `src/renderer/stores/editor.ts`

- [ ] Step 1: Write failing tests for `switchWorktree()` preserving tabs and active file per worktree.
- [ ] Step 2: Write failing tests for clearing pending cursor and current cursor line during worktree switches.
- [ ] Step 3: Run `corepack pnpm test -- editorWorktreeState` and confirm red/green cycle.

### Task 2: Cover renderer navigation semantics

**Files:**
- Create: `src/renderer/components/files/__tests__/editorNavigation.test.ts`
- Create: `src/renderer/App/hooks/__tests__/useTerminalNavigation.test.ts`
- Optional create: `src/renderer/components/files/editorNavigation.ts`
- Modify: `src/renderer/App/hooks/useTerminalNavigation.ts`
- Reference: `src/renderer/stores/navigation.ts`

- [ ] Step 1: Write failing tests for one-shot navigation requests and preview/cursor forwarding.
- [ ] Step 2: If hook testing is too coupled, extract a tiny pure helper and keep the hook as a thin wrapper.
- [ ] Step 3: Run `corepack pnpm test -- editorNavigation useTerminalNavigation` and confirm green.

## Chunk 2: Main Session Lifecycle

### Task 3: Cover session attach/detach and remote state transitions

**Files:**
- Create: `src/main/services/session/__tests__/SessionManager.test.ts`
- Reference: `src/main/services/session/SessionManager.ts`

- [ ] Step 1: Write failing tests for local attach buffering and last-window detach cleanup.
- [ ] Step 2: Write failing tests for remote attach behavior during disconnected recoverable and non-recoverable states.
- [ ] Step 3: Run `corepack pnpm test -- SessionManager` and confirm green.

## Verification

- [ ] Run `corepack pnpm test`
- [ ] Run `corepack pnpm exec tsc --noEmit`
- [ ] Run `corepack pnpm exec biome check .`
