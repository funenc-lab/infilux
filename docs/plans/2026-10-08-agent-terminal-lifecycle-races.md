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
4. Build the x64 package using existing local Electron/native binaries, integrate
   the verified source into the clean primary workspace, and synchronize its
   verified build output while retaining the previous generated output.
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
- [x] Integrate, package, and verify the isolated packaged application.
- [x] Replace the local application with a recoverable backup and preserve hosts.

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
- Local source integration: `816ad4f` was fast-forwarded into `main`. Primary
  workspace verification passed `pnpm lint` (1516 files plus theme/test-quality
  audits), `pnpm typecheck`, and all 184 scoped tests. No remote push was made.
- The primary `out/` directory was synchronized from the tested build;
  `diff -qr` confirmed equality. Its previous generated output is retained under
  `.tmp/primary-out-backup-f7hdAp/out`.
- Installation completed on 2026-10-08. `/Applications/Infilux.app` has the same
  `app.asar` SHA-256 as the isolated tested package. The previous installed
  archive hash is
  `f8b30b991e6ba3cc78af9518b34330973f1e51e864d3db8ca12ff318d8f8920a`.
- Normal quit stopped app PID 93314 without killing any of the ten Agent pane
  processes. Relaunch produced PID 39296; all ten tmux clients are attached from
  this new main process, with the same pane session names and process IDs as
  before replacement. No production keyboard input or message was sent.
- Recoverable backup:
  `~/Library/Application Support/Infilux/Install Backups/lifecycle-fix-G6ZceD/`.
  It contains the previous app bundle, settings, session state, pane identity
  snapshots, and a SQLite `.backup`; `PRAGMA quick_check` returned `ok`.
- The isolated packaged screenshot shows restored terminal history. The E2E
  history assertion remains buffer-based, not a canvas-pixel assertion.
- The application remains unsigned, matching the previous local installation.
  This repair does not claim a signed/public release or an entirely green
  full-suite result while the independent ImageMagick prerequisite is missing.
