# Agent Session Recovery Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build persistent recovery for all Agent sessions so the app can quit and later auto-restore active sessions without requiring users to manually start them again.

**Architecture:** Introduce a main-process persistent agent session orchestration layer that owns session registry, host selection, and restore reconciliation. Move platform-specific process persistence behind a SessionHost abstraction, then let renderer stores and AgentPanel rehydrate against the authoritative recovery snapshot instead of relying on Claude-only or localStorage-only heuristics.

**Tech Stack:** Electron, TypeScript, React, Zustand, Vitest, tmux on macOS/Linux, application-managed supervisor on Windows

---

## File map

### New files

- `src/shared/types/agentSession.ts` — Shared recovery types, records, enums, restore result payloads
- `src/main/services/session/PersistentAgentSessionService.ts` — Main orchestration service for persistent Agent sessions
- `src/main/services/session/SessionHost.ts` — Session host interface and shared host result types
- `src/main/services/session/hosts/TmuxSessionHost.ts` — tmux-backed host implementation for Unix
- `src/main/services/session/hosts/SupervisorSessionHost.ts` — Windows host implementation
- `src/main/services/session/__tests__/PersistentAgentSessionService.test.ts` — Service tests
- `src/main/services/session/hosts/__tests__/TmuxSessionHost.test.ts` — tmux host tests
- `src/main/services/session/hosts/__tests__/SupervisorSessionHost.test.ts` — supervisor host tests
- `src/renderer/stores/__tests__/agentSessionsRecovery.test.ts` — recovery rehydrate tests

### Modified files

- `src/shared/types/ipc.ts` — Add agent session recovery channels
- `src/shared/types/index.ts` — Export new shared recovery types
- `src/shared/types/session.ts` — Extend session metadata for persistent host semantics when needed
- `src/main/ipc/session.ts` — Keep base session behavior aligned with persistent session semantics
- `src/main/ipc/index.ts` — Register new IPC handlers
- `src/main/services/session/SessionManager.ts` — Support persistent local Agent sessions and non-destructive detach
- `src/main/services/SharedSessionState.ts` — Persist and read persistent Agent session registry
- `src/preload/index.ts` — Expose typed `agentSession.*` bridge methods
- `src/preload/types.ts` — Update `ElectronAPI` typings
- `src/renderer/stores/agentSessions.ts` — Replace Claude-only resumable logic with capability-based persistence and recovery state
- `src/renderer/components/chat/AgentPanel.tsx` — Auto-restore worktree sessions and reconcile UI sessions
- `src/renderer/components/chat/AgentTerminal.tsx` — Remove local Claude-only host assumptions; consume restored backend session ids
- `src/renderer/hooks/useXterm.ts` — Attach/reconcile flow and failure handling for recovered backend sessions
- `src/main/services/cli/TmuxDetector.ts` — Reuse or extend tmux capability checks if needed

---

## Chunk 1: Shared contracts and session-state persistence

### Task 1: Add shared recovery types

**Files:**
- Create: `src/shared/types/agentSession.ts`
- Modify: `src/shared/types/index.ts`
- Test: compile-time coverage via `pnpm typecheck`

- [ ] **Step 1: Write the type design in the new shared file**

Define explicit types for:
- `PersistentAgentHostKind`
- `PersistentAgentRecoveryPolicy`
- `PersistentAgentRuntimeState`
- `PersistentAgentSessionRecord`
- `AgentSessionRestoreItem`
- `RestoreWorktreeSessionsRequest`
- `RestoreWorktreeSessionsResult`

- [ ] **Step 2: Export the new types from the shared barrel**

Update `src/shared/types/index.ts` so main, preload, and renderer can share the same contracts.

- [ ] **Step 3: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS or only unrelated pre-existing failures

- [ ] **Step 4: Commit**

```bash
git add src/shared/types/agentSession.ts src/shared/types/index.ts
git commit -m "feat(session): add shared agent recovery contracts"
```

### Task 2: Extend IPC vocabulary for recovery orchestration

**Files:**
- Modify: `src/shared/types/ipc.ts`
- Test: `pnpm typecheck`

- [ ] **Step 1: Add explicit IPC channel constants**

Add channels for:
- `agentSession:listRecoverable`
- `agentSession:restoreWorktree`
- `agentSession:reconcile`
- `agentSession:abandon`
- `agentSession:markPersistent`

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS or only unrelated pre-existing failures

- [ ] **Step 3: Commit**

```bash
git add src/shared/types/ipc.ts
git commit -m "feat(ipc): add agent session recovery channels"
```

### Task 3: Persist a dedicated agent session recovery registry in shared state

**Files:**
- Modify: `src/main/services/SharedSessionState.ts`
- Test: `src/main/services/__tests__/SharedSessionState.test.ts`

- [ ] **Step 1: Write failing tests for the new persistent agent registry shape**

Add test cases that verify:
- default document includes an empty agent session registry
- registry data is normalized on read
- registry writes are atomic and cached

- [ ] **Step 2: Run the focused test to verify failure**

Run: `pnpm test -- src/main/services/__tests__/SharedSessionState.test.ts`
Expected: FAIL because the new shape is not implemented yet

- [ ] **Step 3: Implement the minimal shared-state support**

Add helper functions such as:
- `readPersistentAgentSessions()`
- `writePersistentAgentSessions()`
- `updatePersistentAgentSessions()`

Keep the document versioning strategy explicit and backward-compatible.

- [ ] **Step 4: Re-run the focused test**

Run: `pnpm test -- src/main/services/__tests__/SharedSessionState.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/services/SharedSessionState.ts src/main/services/__tests__/SharedSessionState.test.ts
git commit -m "feat(session): persist agent recovery registry"
```

---

## Chunk 2: Main-process host abstraction and orchestration

### Task 4: Introduce a host abstraction for persistent Agent sessions

**Files:**
- Create: `src/main/services/session/SessionHost.ts`
- Test: `pnpm typecheck`

- [ ] **Step 1: Define the host interface and result types**

Include operations for create, attach, detach, resume, probe, list, and kill. Keep transport-neutral naming so tmux and supervisor can conform without leaking implementation details.

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS or only unrelated pre-existing failures

- [ ] **Step 3: Commit**

```bash
git add src/main/services/session/SessionHost.ts
git commit -m "feat(session): add persistent session host abstraction"
```

### Task 5: Implement the Unix tmux host

**Files:**
- Create: `src/main/services/session/hosts/TmuxSessionHost.ts`
- Test: `src/main/services/session/hosts/__tests__/TmuxSessionHost.test.ts`

- [ ] **Step 1: Write failing tests for tmux host behavior**

Cover:
- host session name derivation
- create/probe/list semantics
- attach/detach behavior
- missing tmux behavior

- [ ] **Step 2: Run the focused test to verify failure**

Run: `pnpm test -- src/main/services/session/hosts/__tests__/TmuxSessionHost.test.ts`
Expected: FAIL because the host does not exist yet

- [ ] **Step 3: Implement the minimal tmux host**

Reuse the existing tmux capability checks and ensure all shell commands are explicit and safely quoted.

- [ ] **Step 4: Re-run the focused test**

Run: `pnpm test -- src/main/services/session/hosts/__tests__/TmuxSessionHost.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/services/session/hosts/TmuxSessionHost.ts src/main/services/session/hosts/__tests__/TmuxSessionHost.test.ts
git commit -m "feat(session): add tmux-backed agent session host"
```

### Task 6: Implement the Windows supervisor host

**Files:**
- Create: `src/main/services/session/hosts/SupervisorSessionHost.ts`
- Test: `src/main/services/session/hosts/__tests__/SupervisorSessionHost.test.ts`

- [ ] **Step 1: Write failing tests for supervisor registry and lifecycle semantics**

Cover:
- process record creation
- probe/list results
- detach without destruction
- explicit kill

- [ ] **Step 2: Run the focused test to verify failure**

Run: `pnpm test -- src/main/services/session/hosts/__tests__/SupervisorSessionHost.test.ts`
Expected: FAIL because the host does not exist yet

- [ ] **Step 3: Implement the minimal supervisor host**

Keep implementation modular so the actual Windows process/watcher mechanics stay internal to the host.

- [ ] **Step 4: Re-run the focused test**

Run: `pnpm test -- src/main/services/session/hosts/__tests__/SupervisorSessionHost.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/services/session/hosts/SupervisorSessionHost.ts src/main/services/session/hosts/__tests__/SupervisorSessionHost.test.ts
git commit -m "feat(session): add supervisor-backed agent session host"
```

### Task 7: Add the persistent session orchestration service

**Files:**
- Create: `src/main/services/session/PersistentAgentSessionService.ts`
- Test: `src/main/services/session/__tests__/PersistentAgentSessionService.test.ts`

- [ ] **Step 1: Write failing tests for restore orchestration**

Cover:
- selecting the correct host by platform
- creating and registering persistent sessions
- restoring worktree sessions from registry
- abandoning stale sessions
- reconciling live host sessions with persisted UI records

- [ ] **Step 2: Run the focused test to verify failure**

Run: `pnpm test -- src/main/services/session/__tests__/PersistentAgentSessionService.test.ts`
Expected: FAIL because the service does not exist yet

- [ ] **Step 3: Implement the minimal orchestration service**

The service should:
- read and write the shared registry
- select host implementation
- probe on startup or restore request
- return renderer-friendly restore snapshots
- avoid mutating session transport logic directly

- [ ] **Step 4: Re-run the focused test**

Run: `pnpm test -- src/main/services/session/__tests__/PersistentAgentSessionService.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/services/session/PersistentAgentSessionService.ts src/main/services/session/__tests__/PersistentAgentSessionService.test.ts
git commit -m "feat(session): add persistent agent session orchestration"
```

---

## Chunk 3: Integrate orchestration into the unified session layer

### Task 8: Teach SessionManager to preserve persistent local Agent sessions across detach

**Files:**
- Modify: `src/main/services/session/SessionManager.ts`
- Test: `src/main/services/session/__tests__/SessionManager.test.ts`

- [ ] **Step 1: Add failing tests for non-destructive detach semantics**

Add scenarios that verify:
- persistent local agent sessions survive the last window detach
- regular terminal sessions still destroy on final detach
- explicit kill still destroys persistent sessions

- [ ] **Step 2: Run the focused test to verify failure**

Run: `pnpm test -- src/main/services/session/__tests__/SessionManager.test.ts`
Expected: FAIL because detach still destroys all local sessions on the last detach

- [ ] **Step 3: Implement the minimal SessionManager changes**

Introduce a clear distinction between:
- ordinary local sessions
- persistent local Agent sessions
- remote sessions

Do not mix host management logic directly into PTY code.

- [ ] **Step 4: Re-run the focused test**

Run: `pnpm test -- src/main/services/session/__tests__/SessionManager.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/services/session/SessionManager.ts src/main/services/session/__tests__/SessionManager.test.ts
git commit -m "feat(session): preserve persistent agent sessions across detach"
```

### Task 9: Add recovery IPC handlers and preload bridge methods

**Files:**
- Modify: `src/main/ipc/index.ts`
- Modify: `src/main/ipc/session.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/preload/types.ts`
- Test: `pnpm typecheck`

- [ ] **Step 1: Add main-process handlers for agent recovery APIs**

Wire the orchestration service into explicit IPC handlers.

- [ ] **Step 2: Expose typed preload bridge methods**

Add `window.electronAPI.agentSession.*` methods and keep the bridge domain-specific.

- [ ] **Step 3: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS or only unrelated pre-existing failures

- [ ] **Step 4: Commit**

```bash
git add src/main/ipc/index.ts src/main/ipc/session.ts src/preload/index.ts src/preload/types.ts
git commit -m "feat(session): expose agent recovery IPC bridge"
```

---

## Chunk 4: Renderer rehydrate and reconcile flow

### Task 10: Replace Claude-only resumable heuristics in the agent session store

**Files:**
- Modify: `src/renderer/stores/agentSessions.ts`
- Test: `src/renderer/stores/__tests__/agentSessionsRecovery.test.ts`

- [ ] **Step 1: Write failing store tests for recovery persistence and reconciliation**

Cover:
- capability-based persistence instead of `claude*` string checks
- restoring backend session ids from recovery snapshots
- auto-creating a missing UI session from a recovered session record
- preserving active session selection by worktree

- [ ] **Step 2: Run the focused test to verify failure**

Run: `pnpm test -- src/renderer/stores/__tests__/agentSessionsRecovery.test.ts`
Expected: FAIL because the new store behavior is not implemented yet

- [ ] **Step 3: Implement the minimal store recovery layer**

Add explicit actions such as:
- `rehydrateRecoverableSessions`
- `reconcileRecoveredSession`
- `markRecoveryDead`
- `abandonRecoveredSession`

Keep runtime-only state separate from persisted metadata.

- [ ] **Step 4: Re-run the focused test**

Run: `pnpm test -- src/renderer/stores/__tests__/agentSessionsRecovery.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/stores/agentSessions.ts src/renderer/stores/__tests__/agentSessionsRecovery.test.ts
git commit -m "feat(renderer): add agent session recovery store flow"
```

### Task 11: Auto-restore worktree sessions inside AgentPanel

**Files:**
- Modify: `src/renderer/components/chat/AgentPanel.tsx`
- Test: focused renderer test if present, otherwise verify by `pnpm typecheck`

- [ ] **Step 1: Add the restore orchestration flow to AgentPanel**

When the panel mounts for the active worktree, request recovery from `window.electronAPI.agentSession.restoreWorktreeSessions(...)`, then reconcile the returned items into the session store.

- [ ] **Step 2: Ensure the panel can create missing UI session tabs from restored records**

Preserve current grouping and active session semantics.

- [ ] **Step 3: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS or only unrelated pre-existing failures

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/chat/AgentPanel.tsx
git commit -m "feat(renderer): auto-restore agent sessions by worktree"
```

### Task 12: Make AgentTerminal and useXterm host-agnostic

**Files:**
- Modify: `src/renderer/components/chat/AgentTerminal.tsx`
- Modify: `src/renderer/hooks/useXterm.ts`
- Test: `pnpm typecheck`

- [ ] **Step 1: Remove local Claude-only host assumptions from AgentTerminal**

Terminal components should consume `backendSessionId` and recovery state, not decide tmux policy themselves.

- [ ] **Step 2: Keep provider-level resume as an optional creation optimization only**

Do not let provider resume semantics become the source of truth for whether a session is recoverable.

- [ ] **Step 3: Harden useXterm attach/reconcile failure handling**

If attach fails for a recovered backend session, request a reconcile result instead of always creating a replacement session immediately.

- [ ] **Step 4: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS or only unrelated pre-existing failures

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/chat/AgentTerminal.tsx src/renderer/hooks/useXterm.ts
git commit -m "feat(renderer): make agent recovery host-agnostic"
```

---

## Chunk 5: Full verification and polish

### Task 13: Verify the end-to-end recovery path

**Files:**
- Modify as needed based on findings
- Test: main focused tests, renderer focused tests, full verification commands

- [ ] **Step 1: Run focused test suites**

Run:
```bash
pnpm test -- src/main/services/__tests__/SharedSessionState.test.ts
pnpm test -- src/main/services/session/__tests__/SessionManager.test.ts
pnpm test -- src/main/services/session/__tests__/PersistentAgentSessionService.test.ts
pnpm test -- src/main/services/session/hosts/__tests__/TmuxSessionHost.test.ts
pnpm test -- src/main/services/session/hosts/__tests__/SupervisorSessionHost.test.ts
pnpm test -- src/renderer/stores/__tests__/agentSessionsRecovery.test.ts
```

Expected: PASS

- [ ] **Step 2: Run project quality gates**

Run:
```bash
pnpm typecheck
pnpm lint
pnpm test
```

Expected: PASS

- [ ] **Step 3: Fix any regressions and re-run the failed commands**

Do not claim completion without fresh output.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(session): add persistent recovery for agent sessions"
```

---

## Notes for implementation

- Keep `SessionManager` responsible for unified session transport and lifecycle, not host-specific shell command construction.
- Keep tmux and supervisor details behind `SessionHost` implementations.
- Do not create a parallel renderer state source outside `agentSessions`.
- Preserve current remote session reconnect semantics.
- Preserve `backendSessionId` as the attach key used by `useXterm`.
- Keep all new IPC payloads as plain objects.
- Add migration-safe defaults in shared session state to avoid breaking existing users.
- Avoid `as any`, hidden globals, or special-case logic keyed only by command string where capability types can be used instead.
