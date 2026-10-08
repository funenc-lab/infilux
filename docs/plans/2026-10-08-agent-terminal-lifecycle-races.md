# Terminal Lifecycle Race Repair Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Preserve usable Agent input through interrupted hibernation and superseded initialization.

**Architecture:** Commit hibernation only after validating the paused surface. Use existing initialization generations and surface identity to reject stale async continuations before they mutate a newer session, and restrict abandoned-session cleanup to owned resources.

**Tech Stack:** React 19, TypeScript, xterm.js, Electron, Vitest, Playwright.

---

## Task 1: Capture and Reproduce

**Files:** Modify `src/renderer/hooks/__tests__/useXterm.test.ts`.

1. Freeze diagnostics with `pnpm diagnostics:collect -- --output-dir .tmp/diagnostics/terminal-lifecycle-races --tail-lines 120`.
2. Verify the isolated baseline with `NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run src/renderer/hooks/__tests__/useXterm.test.ts --reporter=dot`.
3. Add Codex/Claude regressions that reactivate during a deferred suspension,
   and finish an obsolete create after a replacement becomes usable.
4. Add regressions for obsolete rejection, attach, detach, runtime lookup,
   output activation, and cancelled persistent/recovered sessions.
5. Run the new cases before production changes and confirm failure is a missing
   or misrouted write, invalid disposal, or unsafe cleanup.

## Task 2: Guard Lifecycle Ownership

**Files:** Modify `src/renderer/hooks/useXterm.ts`.

1. Keep hibernation snapshot and pending state local until suspension completes:

   ```typescript
   await window.electronAPI.session.setOutputDelivery(sessionId, false);
   if (isUnmountedRef.current || terminalRef.current !== terminal || ptyIdRef.current !== sessionId) return;
   if (isActiveRef.current || isVisibleRef.current || terminal.hasSelection()) {
     await window.electronAPI.session.setOutputDelivery(sessionId, true);
     return;
   }
   hibernatedSurfaceStateRef.current = surfaceState;
   isHibernatedRef.current = true;
   disposeTerminal();
   ```

2. Define an attempt-local guard using unmount state, `initAttemptIdRef`, and
   terminal identity. Validate after reset/detach before disposing a surface.
3. Validate after runtime lookup and creation before binding/subscribing. Reject
   obsolete attach successes and errors before fallback or global cleanup.
4. Retain an attempt-local created descriptor for cleanup. Do not kill a reused
   session or the currently bound session; detach persistent abandoned creations.
5. Guard outer error cleanup and replay/output continuations. Preserve the
   existing successful input flush and startup-first-output behavior.
6. Guard late hibernation transcript reads before shared replay state changes.
   Prevent another hibernation while restoration is pending, and reevaluate the
   idle schedule when loading ends.
7. Preserve published Agent sessions across canvas-host replacement. Record
   publication by session ID rather than by a descriptor-independent flag.
8. Bind replay surface completion to the current initialization epoch so both
   initialization and output-resync callbacks cannot clear replacement loading.
9. Run all hook and AgentTerminal integration tests and confirm they pass.

## Task 3: Validate and Deploy

**Files:** Extend `e2e/agent-wheel-scroll.test.ts` if needed for deterministic
IPC-boundary scenarios. Update this plan with results.

1. Validate two repeated hibernation cycles with real keyboard input and retained
   viewport history in an isolated Electron profile using shared helpers.
   Exercise interrupted IPC boundaries deterministically in hook regressions;
   do not add production-only timing hooks for E2E tests.
2. Run `pnpm typecheck`, `pnpm lint`, and
   `NODE_OPTIONS=--no-experimental-webstorage pnpm test --reporter=dot`.
3. Review changed files and lifecycle invariants. Run `git diff --check`.
4. Integrate the verified fix into the clean primary workspace and build the x64
   package using the existing local Electron distribution and native binaries.
5. Test the packaged executable with fixture-owned HOME, dev runtime channel,
   and Chromium user-data directory. Do not reuse production state.
6. Back up the current app/state, request normal quit, replace the installed
   bundle, restart it, and verify persistent pane processes were not terminated.
7. Record exact verification results and any independent environment failures.

## Progress

- [x] Capture diagnostics and establish the 70-test isolated hook baseline.
- [x] Persist failing lifecycle regressions.
- [x] Guard transition ownership and make all scoped regressions pass.
- [x] Validate Electron keyboard input and review the fix.
- [x] Run quality gates and record full-suite status.
- [ ] Integrate, package, and verify the isolated packaged application.
- [ ] Replace the local application with a recoverable backup and preserve hosts.

## Verification Record

- The 19 initial lifecycle regressions failed against the original production
  hook using an in-memory Vitest source override, without changing the baseline.
- Review-driven tests reproduced obsolete replay output going to disposed
  surface 1 instead of replacement surface 2, overlapping restoration disposal,
  cross-host kill/detach, and stale initialization/resync clearing new loading.
- Scoped verification: 101 `useXterm` tests and 83 AgentTerminal integration
  tests passed (184 total), including the 31 new hook cases.
- Final typecheck passed. The worktree root is excluded by the repository's
  Biome ignore rules, so `pnpm lint` processed no files. The equivalent explicit
  tracked-file Biome check processed 1515 files successfully; the renderer theme
  and test quality audits passed. The changed E2E file and `git diff --check`
  also passed.
- Full suite: 3834 passed, 1 failed in 616 test files. The only failure is the
  unchanged logo generator test because the local `magick` command is missing.
  This is the same independent environment failure as before the repair;
  no test was disabled or changed to conceal it.
- Independent review covered all five changed files with no remaining blocking
  findings, and independently passed all 184 scoped tests.
- The final source build and x64 directory package passed. Packaging reused the
  existing local Electron/native binaries and retained the installed app's
  unsigned status; it did not publish a release.
- Built and packaged Electron keyboard checks passed. The final packaged check
  verifies two hidden-surface hibernation cycles, retained viewport history,
  and each typed line reaching the fixture process exactly once. Viewport history
  is checked from the xterm buffer, not by a canvas pixel assertion.
- Tested package `app.asar` SHA-256:
  `696c9ff37d983bbd44df4dfa8f294d8ef1db6d7a9104dd3d985f84caa011b93b`.
- Local integration and installation checks are pending.
