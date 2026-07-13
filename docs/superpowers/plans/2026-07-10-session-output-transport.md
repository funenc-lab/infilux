# Session Output Transport Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use inline execution with test-first checkpoints. Preserve all user-owned worktree changes and do not create commits in the dirty worktree.

**Goal:** Batch supervisor and remote session output across the remote transport and Electron IPC boundaries without changing session protocol or lifecycle semantics.

**Architecture:** The remote helper batches live output per session before broadcasting `remote:session:data`. `SessionManager` batches all live backend output per window before sending `session:data`; exits flush queued output before their exit event is emitted.

**Tech Stack:** Electron 39, Node.js, TypeScript 5.9, Vitest, generated remote Node.js helper source.

## Global Constraints

- Preserve existing uncommitted user-owned changes.
- All source code, tests, and comments are English-only.
- Do not change IPC channels, serialized payload shapes, or remote RPC method contracts.
- Keep attach replay direct and preserve local/remote lifecycle cleanup.
- Do not add dependencies, `any`, `@ts-ignore`, or hidden global state.
- Do not commit from the current dirty worktree.

---

### Task 1: Generalize main-process live output batching

**Files:**
- Modify: `src/main/services/session/SessionManager.ts`
- Modify: `src/main/services/session/__tests__/SessionManager.test.ts`

**Interfaces:**
- Replace the local-only output dispatch helper with `emitBatchedSessionData(sessionId, data, windowIds?)`.
- Keep `SessionOutputBatcher` as the per-window queue owner.

- [x] Write failing tests proving consecutive supervisor output and consecutive remote output emit one `session:data` payload after 16ms.
- [x] Write failing tests proving remote output flushes before `session:exit` and queued remote output is discarded after detach.
- [x] Run the focused test file and confirm the new expectations fail against the local-only implementation.
- [x] Route live local PTY, supervisor, remote listener, and reconnect delta output through the generic batching helper.
- [x] Rename diagnostics and cleanup ownership from local-only to backend-neutral without changing output limits.
- [x] Run `pnpm exec vitest run src/main/services/session/__tests__/SessionManager.test.ts --maxWorkers=1 --minWorkers=1` and confirm all tests pass.

### Task 2: Batch remote helper live output

**Files:**
- Modify: `src/main/services/remote/RemoteHelperSource.ts`
- Modify: `src/main/services/remote/__tests__/RemoteHelperSource.test.ts`

**Interfaces:**
- Add a helper-local per-session output queue with `enqueueSessionOutput(session, chunk)`, `flushSessionOutput(sessionId)`, and `discardSessionOutput(sessionId)`.
- Preserve `emitSessionData(session, chunk)` as the output entry point.

- [x] Write failing source-contract tests for the 16ms/64KiB queue, bounded Unicode-safe splitting, exit flush, and removal cleanup.
- [x] Run `pnpm exec vitest run src/main/services/remote/__tests__/RemoteHelperSource.test.ts --maxWorkers=1 --minWorkers=1` and confirm the assertions fail.
- [x] Implement the helper-local queue so replay is appended immediately and only live broadcast is delayed.
- [x] Flush before exit and discard when no live consumers or after session removal.
- [x] Run the focused remote helper test and confirm it passes.

### Task 3: Verify cross-layer ordering and regression safety

**Files:**
- Modify only tests required by Tasks 1 and 2.

- [x] Run the session manager, remote helper, xterm output buffer, useXterm, and viewport-sync tests together.
- [x] Run `pnpm typecheck`, `pnpm lint`, and `git diff --check`.
- [x] Run `pnpm test` and report exact totals or any unrelated failures without altering user-owned files.
