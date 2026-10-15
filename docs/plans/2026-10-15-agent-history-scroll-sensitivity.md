# Agent History Scroll Sensitivity Implementation Plan

> **For Codex:** Execute the approved tasks in this workspace with test-driven development and verification checkpoints.

**Goal:** Prevent gentle wheel gestures from causing disproportionately large agent history jumps.

**Architecture:** Keep the existing scroll-owner policy and fractional carry. Normalize app-owned pixel events with one multiplier and size compatibility pages from the live terminal viewport, including tmux fallback. Preserve native mouse delegation and all existing session/input protection.

**Tech Stack:** TypeScript, React, xterm.js, Vitest, Playwright Electron, tmux.

---

## Task 1: Reproduce the Policy and Hook Regressions

Status: Complete. All 13 new policy/hook regressions failed against the existing implementation for the expected delta amplification and premature/repeated page dispatch.

Files:
- `src/renderer/hooks/__tests__/xtermWheelPolicy.test.ts`
- `src/renderer/hooks/__tests__/useXterm.test.ts`

1. Compare equal total pixel deltas split above and below the old 50-pixel boundary in local and managed history, at device scales 1 and 2.
2. Assert that compatibility paging waits for a visible viewport's worth of lines and never emits more than one page per event.
3. Exercise the real wheel policy through the hook with a 40-row viewport in direct, local tmux, and remote tmux modes.
4. Run the focused tests and record assertion failures caused by the existing multiplier/page sizing, before changing production code.

Run:
```bash
env NODE_OPTIONS=--no-experimental-webstorage pnpm --config.manage-package-manager-versions=false exec vitest run src/renderer/hooks/__tests__/xtermWheelPolicy.test.ts src/renderer/hooks/__tests__/useXterm.test.ts --maxWorkers 2 --silent
```

## Task 2: Correct Delta and Page Conversion

Status: Complete. All 451 related tests passed after the fixes. Read-only review exposed exact-page floating-point and viewport-shrink carry boundaries; both were reproduced with failing policy/hook regressions before their fixes.

Files:
- `src/renderer/hooks/xtermWheelPolicy.ts`
- `src/renderer/hooks/useXterm.ts`
- Corresponding tests from Task 1

1. Replace the threshold-dependent pixel multiplier with constant gentle scaling, retaining the existing fractional accumulator.
2. Normalize a valid visible row count, using 24 as the safe default. Replace fixed eight-line browser-page and compatibility-page conversion with this count.
3. Limit compatibility repeat to one and retain only a sub-page remainder when dropping large-event excess.
4. Pass `terminal.rows` into wheel conversion and `request.terminal.rows` into confirmed tmux alternate-screen fallback.
5. Update historical expectations only where the approved behavior intentionally changes, and rerun the focused tests.
6. Normalize near-integer line sums and discard stale whole-page carry before adding the next program delta. Verify fragmented pixel page boundaries, no duplicate page after a tiny subsequent event, and direct/local/remote paging after a 40-to-20-row resize.

## Task 3: Verify Real History Movement and Regressions

Status: Complete. The old Electron build failed both isolated local and tmux coarse-event regressions as expected. The new build, typecheck, lint, all 17 transcript interaction scenarios, and final read-only review passed.

Files:
- `e2e/agent-wheel-scroll.test.ts`

1. Add an isolated Electron regression comparing equal-distance fine and coarse wheel events in both local and tmux-owned history. Read visible transcript markers rather than private scrolling methods.
2. Observe the regression failing against the existing build, then rebuild before verifying the fix.
3. Rerun native agent wheel/input, managed history return-to-live, and missing-host input fallback scenarios.
4. Run the remaining transcript interaction scenarios for scrollbar dragging, pointer input, hibernation, foreground/canvas movement, clipboard selection, and drag auto-scroll.
5. Run related unit/integration tests, `pnpm typecheck`, `pnpm lint`, and `git diff --check`.
6. Request a read-only review, address any confirmed issue with a failing regression, and leave all changes uncommitted.

Run:
```bash
env pnpm_config_verify_deps_before_run=warn pnpm --config.manage-package-manager-versions=false --config.verify-deps-before-run=warn build
env pnpm_config_verify_deps_before_run=warn NODE_OPTIONS=--no-experimental-webstorage pnpm --config.manage-package-manager-versions=false --config.verify-deps-before-run=warn exec vitest run --config vitest.e2e.config.ts e2e/agent-wheel-scroll.test.ts -t 'gentle|native agent mouse|managed tmux history|missing tmux host' --maxWorkers 1
env pnpm_config_verify_deps_before_run=warn NODE_OPTIONS=--no-experimental-webstorage pnpm --config.manage-package-manager-versions=false --config.verify-deps-before-run=warn exec vitest run --config vitest.e2e.config.ts e2e/agent-wheel-scroll.test.ts -t 'scrolls agent transcript history|pointer gestures|hidden Agent|moves to the foreground|copies selected|keeps drag selection|auto-scrolls' --maxWorkers 1
env pnpm_config_verify_deps_before_run=warn pnpm --config.manage-package-manager-versions=false --config.verify-deps-before-run=warn typecheck
env pnpm_config_verify_deps_before_run=warn pnpm --config.manage-package-manager-versions=false --config.verify-deps-before-run=warn lint
git diff --check
```

## Verification Results

- RED: All 13 initial policy/hook regressions failed before the production fix. The four precision/resize policy cases and three augmented hook cases failed before the review follow-up fixes.
- RED: Both coarse-event Electron scenarios failed against the previous renderer bundle, showing the original amplified history movement.
- GREEN: All 451 tests across eight related policy, hook, session, and agent-terminal suites passed.
- GREEN: All 17 Electron transcript interaction cases passed across two non-overlapping selections: eight core scroll/input cases and nine existing interaction cases.
- GREEN: Project `typecheck`, full `lint`, and the main/preload/renderer build exited successfully. The renderer build completed in 4m 25s.
- Review: Final read-only review found no unresolved issue. Independent review covered 19 targeted policy/hook cases and positive/negative numerical boundaries, including fractional device scales.
- Screenshots: Inspected local and tmux gentle-scroll screenshots. Both show the same visible transcript interval; the tmux case has no local history scrollbar. Test screenshots remain under `.tmp/e2e/`.
- Scope: Existing input-delivery recovery changes were preserved. No installed app replacement, real-session interaction, commit, push, dependency declaration change, or lockfile change was performed.

## Verification Limitations

- The full repository-wide unit and Electron suites were not run. Verification covers the eight related unit/integration files and the complete agent transcript interaction file.
- The standard project typecheck does not include `e2e/`. A supplemental in-memory E2E typecheck comparison found no new diagnostics against HEAD, but two pre-existing helper diagnostics remain: the fixture's `recoveryState` session type and `ProcessEnv` compatibility with Playwright's environment type.
- The local package manager warns about dependency metadata being out of sync and legacy package settings. Verification used `verify-deps-before-run=warn` to prevent implicit dependency installation during commands; no package configuration was changed.
