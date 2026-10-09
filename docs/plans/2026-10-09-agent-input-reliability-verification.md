# Agent Input Reliability Verification

## Scope

This verification covers the bounded input-transport and terminal-echo repair
on `perf/agent-startup-readiness`. It does not replace or restart the installed
application, send messages through real Codex or Claude providers, or claim
native IME, provider cold-start, or long-soak coverage.

## Implementation Evidence

- Session input now has an awaited acceptance path. Missing sessions, non-live
  runtimes, unavailable PTYs, and failed remote/supervisor writes reject without
  implicit retries.
- Same-session enhanced dispatches are serialized across text, delay, and submit
  phases. Different sessions remain independent.
- Renderer failures produce one generic notification per failure episode. Old
  async results cannot notify or activate a switched or unmounted surface.
- Shift+Enter and other custom terminal keys use the same guarded writer as
  ordinary xterm input.
- Visible response acceleration is bounded to four small events and 64 Ki UTF-16
  characters within a 50 ms response burst and 500 ms input window. Autonomous
  output keeps the existing 30 ms batch and main/supervisor 16 ms batching is
  unchanged.
- Remote and supervisor input epochs prevent late failures from an older write
  from regressing a successfully recovered live session.
- Final unmount clears only the pending interactive delay policy before draining
  the ordered terminal buffer, preventing tail loss during immediate disposal.

## Verification Runs

- Focused transport, renderer, IPC, terminal, and localization suites: **9 test
  files, 415 tests passed**.
- `SessionManager.test.ts`: **111 tests passed**, including parameterized remote
  reattach and connection-recovery late-failure regressions.
- `pnpm typecheck`: passed.
- `pnpm exec biome check src scripts e2e`: passed after formatting the final
  regression assertions.
- `pnpm build`: passed after the final source changes. Electron Vite emitted main,
  preload, and renderer bundles; the two existing non-module script warnings in
  `index.html` remain informational.
- Full Vitest regression observed **616 files / 3,896 tests passed** with one
  environment failure: `scripts/__tests__/generateLogoAssets.test.ts` requires
  the unavailable `magick` command. The run started before the final remote and
  unmount regression additions, so the current focused run above is the final
  source-level evidence. The prerequisite was not disabled or silently skipped.

## Isolated Electron Measurement

The performance scenario uses fixture-owned PTYs, an isolated temporary profile,
real clocks, parsed xterm echo timing, and no provider authentication. The
earlier baseline/optimized samples are descriptive measurements on a busy
development machine, not a controlled production benchmark. They do not measure
pixel paint, native IME candidate windows, repository switching, provider cold
startup, or a 60-second hibernation transition. The final run artifacts and
screenshots are recorded under `.tmp/e2e/` after the final build.

The final post-build run (`input-burst-after`) passed one scenario with these
samples: quiet input median **21.9 ms** (12 samples), background-before-echo
streaming median **49.5 ms** (12), switched surfaces median **34.8 ms** (3),
restored surfaces median **21.7 ms** (5), Shift+Enter **25.2 ms**, and Unicode
input **90.2 ms** (one sample). Fixture logs and the inspected screenshot show
each streamed, Shift+Enter, switched, restored, and Unicode echo exactly once.
The selected hidden-surface keyboard restoration scenario also passed one test;
its current fixture exercises immediate surface disposal/restoration rather than
the full timer-driven hibernation interval.

## Production Boundary

The installed `/Applications/Infilux.app` was not replaced or restarted. No real
Codex/Claude session received test input. The primary `main` worktree and its
uncommitted user changes were left untouched. No merge or push was performed.

Remaining acceptance work is a controlled packaged-app rollout, native IME and
candidate-window testing, authenticated provider startup, repository-switch
coverage, pixel-level output checks, long-duration multi-session load, and the
missing ImageMagick prerequisite.
