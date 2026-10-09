# Agent Input Reliability Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Surface failed input delivery without duplicate sends and preserve responsive echo during brief streaming interference.

**Architecture:** Keep the current session/preload contracts and xterm writer. Add an acknowledged service entry point, propagate failures through IPC, and extend the existing interactive scheduling policy within explicit bounds.

**Tech Stack:** Electron, TypeScript, React, xterm.js, Vitest, Playwright.

---

## Progress

- [ ] Transport and enhanced-input acceptance
- [ ] Renderer notification and custom-key ownership
- [ ] Bounded multi-event response acceleration
- [ ] Isolated Electron regression and quality gates

### Task 1: Transport Acceptance

**Files:** `src/main/services/session/SessionManager.ts`, `src/main/services/session/AgentInputService.ts`, `src/main/services/terminal/PtyManager.ts`, `src/main/ipc/session.ts`, `src/main/ipc/agentInput.ts`, corresponding `__tests__` files.

1. Add regressions asserting pending transport keeps IPC pending, missing/non-live
   sessions reject, local missing PTYs reject, and failed text prevents submit.
2. Run targeted tests and confirm the expected RED assertions.
3. Implement `async writeInput(sessionId, data): Promise<void>` and keep `write`
   as a guarded fire-and-forget compatibility wrapper. Return a boolean from PTY
   writes so absent PTYs cannot count as accepted. Await service dispatch in IPC.
4. Run `NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run
   src/main/services/session/__tests__/SessionManager.test.ts
   src/main/services/session/__tests__/AgentInputService.test.ts
   src/main/services/terminal/__tests__/PtyManager.test.ts
   src/main/ipc/__tests__/session.test.ts src/main/ipc/__tests__/agentInput.test.ts`.

### Task 2: Failure Feedback

**Files:** `src/renderer/hooks/useXterm.ts`, `src/renderer/components/chat/AgentTerminal.tsx`, `src/renderer/components/terminal/ShellTerminal.tsx`, corresponding tests.

1. Add failure, deduplication, stale-result, and custom-key writer regressions.
2. Confirm RED with the focused hook/component tests.
3. Add an `onInputError` callback and handle rejected sends without retaining or
   resending their text. Guard async results by attempt/session identity and
   failure sequence. Reuse existing toast primitives and generic English copy.
4. Supply the guarded `write` function to custom-key handlers; use it for LF.
5. Run the focused hook/component suites and verify feedback is observable.

### Task 3: Bounded Response Burst

**Files:** `src/renderer/hooks/useXterm.ts`, `src/renderer/hooks/__tests__/useXterm.test.ts`.

1. Add background-then-echo, time/event/size-bound, ordering, and hide tests.
2. Confirm the new burst cases fail with the one-shot marker.
3. Track a 500ms input deadline, a 50ms first-response deadline, a four-event
   budget, and a 64Ki-character budget; clear all on hide/reset/failure.
4. Keep the existing serialized buffer flush; never synchronously render output.
5. Verify all focused tests, including normal 30ms autonomous-output batching.

### Task 4: End-to-End and Review

**Files:** `e2e/agent-input-performance.test.ts`, fixture helpers/tests only if required, `docs/plans/2026-10-09-agent-input-reliability-verification.md`.

1. Extend isolated fixture behavior to place background output ahead of echo.
2. Confirm baseline latency differs from the bounded-burst implementation.
3. Run a fresh `pnpm build`, `pnpm typecheck`, focused tests, `pnpm lint`, and
   isolated Electron input/performance regressions with real clocks.
4. Request read-only review of the changed implementation and tests.
5. Record results and residual native-IME/provider/long-soak gaps. Keep the
   installed production app untouched and report any environmental gate failure.
