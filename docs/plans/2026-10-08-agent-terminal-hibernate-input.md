# Terminal Input Recovery Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Restore reliable Agent and terminal input after surface hibernation without losing or misrouting queued input.

**Architecture:** Reuse one guarded pending-input flush callback for initial attach, reconnect, and hibernated-surface restoration. Release the restoration input gate only after replay and output delivery are ready, and ignore cancelled or superseded restorations. Keep provider, IPC, backend, and persistence behavior unchanged.

**Tech Stack:** React 19, TypeScript, xterm.js, Electron 39, Vitest, Playwright.

---

## Task 1: Reproduce Lost Input

**Files:** Modify `src/renderer/hooks/__tests__/useXterm.test.ts`.

1. Extend the existing hibernated-surface replay regression. Emit input while replay
   is pending, then assert it reaches `session.write` exactly once after restoration.
   Emit another character after restoration and assert it is written immediately.
2. Run `pnpm exec vitest run src/renderer/hooks/__tests__/useXterm.test.ts -t 'recreates a hibernated surface'`.
3. Confirm failure is a missing session write, not a harness or dependency error.

## Task 2: Release Input After Successful Restoration

**Files:** Modify `src/renderer/hooks/useXterm.ts`.

1. Move the existing pending-input flush closure to a stable hook callback beside
   `write`. Reject unmounted or mismatched bindings, clear the creation gate, and
   retain the queue when the runtime is not live:

   ```typescript
   const flushPendingTerminalInput = useCallback((sessionId: string) => {
     if (isUnmountedRef.current || ptyIdRef.current !== sessionId) return;
     isSessionCreationPendingRef.current = false;
     if (runtimeStateRef.current !== 'live') return;
     const pendingInput = pendingTerminalInputRef.current;
     pendingTerminalInputRef.current = '';
     if (pendingInput) window.electronAPI.session.write(sessionId, pendingInput);
   }, []);
   ```

2. Keep the runtime ref coherent when binding a live session, so a previous dead
   state cannot leave initial pending input stranded.
3. After restoring output delivery, validate the current attempt, xterm instance,
   and backend binding before invoking the shared flush callback.
4. Remove the old local closure and update callback dependencies.
5. Run the failing regression and all existing hook tests. Expect all to pass.

## Task 3: Cover Lifecycle Boundaries

**Files:** Modify `src/renderer/hooks/__tests__/useXterm.test.ts`; add or extend an
isolated Electron scenario under `e2e/` using `e2e/helpers/electronApp.ts`.

1. Add regressions for multiple hibernation cycles, Codex and Claude inputs, a
   reconnect during restoration, and cancellation before output delivery resumes.
2. Verify no new backend session is created during surface restoration, and no
   input goes to a superseded or unmounted session.
3. Exercise real xterm keyboard input after a hidden session has hibernated in an
   isolated Electron profile. Do not use or interrupt production sessions.
4. Run targeted tests and Electron E2E after building with `pnpm build`.

## Task 4: Verify, Integrate, and Prepare Deployment

1. Run `pnpm typecheck`, `pnpm lint`, and `pnpm test`; record any independent
   baseline issues rather than masking them.
2. Review the diff for initial attach, reconnect, replay, cleanup, and remote
   behavior. Run `git diff --check`.
3. Commit the scoped change on the fix branch and integrate into the clean
   primary workspace once verification is complete.
4. Build the macOS application with existing signing and packaging helpers. Use
   isolated state to check the resulting package before replacing the installed
   application. Preserve a recoverable copy of the previous installation.
5. Check running production sessions before installation/restart. Never manually
   flush the existing unknown 74-character production input queue or terminate
   persistent hosts as part of replacement.

## Progress

- [x] Diagnose the live renderer input gate and inspect the missing restore transition.
- [x] Establish an isolated workspace and pass the 66-test hook baseline.
- [x] Reproduce the failure with a regression test (missing session write after restore).
- [x] Implement and verify guarded restore input release (66 hook tests passed).
- [x] Cover repeated Codex/Claude restoration, reconnect, and unmount cancellation.
- [x] Verify real keyboard input through the PTY after two hibernation cycles in isolated Electron E2E.
- [x] Verify superseded restoration cannot release a replacement session's pending input.
- [x] Pass scoped tests, type checking, equivalent lint checks, and independent review.
- [x] Build the x64 app and pass the same two-cycle keyboard E2E against the packaged binary.
- [ ] Integrate the fix and replace the installed app with a recoverable backup.
- [ ] Pass the entire test suite (blocked by the unrelated missing ImageMagick CLI).

## Verification Notes

- `pnpm typecheck` passed after typing deferred test output-delivery promises as `Promise<undefined>`.
- The worktree directory is intentionally excluded by Biome's directory scanner;
  enumerate tracked source/config files explicitly for the equivalent whole-repo check.
- Node 25 enables a global Web Storage object incompatible with several jsdom tests.
  Run the full suite with `NODE_OPTIONS=--no-experimental-webstorage`; targeted
  AgentTerminal and useXterm suites then passed (152 tests).
- Native macOS rebuild hit a pre-existing Command Line Tools header problem.
  All three native modules load in Electron x64 using their matching prebuilt
  dependencies. SQLite matches the installed app's binary checksum exactly.
- Final targeted run passed all 70 useXterm and 83 AgentTerminal tests (153 total).
  The full run passed 3802 tests, with one independent logo-generation failure
  because `magick` is not installed. No product-code or test skip was added to
  conceal this environmental failure.
- Whole-repo Biome verification processed 1510 files; theme and strict test-quality
  audits passed. Packaged HTML, main, preload, AgentPanel, and ShellTerminal files
  match the tested build byte for byte.
- Packaged E2E uses an explicit fixture-owned Chromium user-data directory as well
  as the existing temporary HOME, profile, and dev runtime channel. It neither
  reuses the installed app's single-instance lock nor its production sessions.
