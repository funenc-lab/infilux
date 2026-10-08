# Agent Startup and Input Performance Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Measure complete Agent startup and reduce confirmed interactive output latency without disrupting live sessions.

**Architecture:** Reuse the startup timeline across prerequisites and `useXterm`. Measure input-to-echo on isolated fixture PTYs, then adjust only the confirmed output batching delay while retaining lifecycle ownership and normal streaming batching.

**Tech Stack:** React 19, TypeScript, xterm.js, Electron, Vitest, Playwright.

---

## Task 1: Timeline Coverage

**Files:** `src/renderer/components/chat/AgentTerminal.tsx`,
`src/renderer/hooks/useXterm.ts`, and their existing integration/hook tests.

1. Add failing tests for prerequisite start/completion/error timing, common
   timeline identity, input-channel readiness, and surface readiness.
2. Run focused new cases and confirm they fail for missing stages.
3. Create a stable per-launch renderer timeline in `AgentTerminal`, mark the
   existing probe effects, and pass it to `useXterm` through an optional option.
4. Mark input readiness and the first actual send without recording its content;
   mark successful current-surface completion once per initialization attempt.
5. Verify read-only transcripts, obsolete callbacks, retries, and ordinary shell
   terminals retain their current behavior.
6. Run `NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run src/renderer/hooks/__tests__/useXterm.test.ts src/renderer/components/chat/__tests__/AgentTerminal.integration.test.ts --reporter=dot`.

## Task 2: Reproducible Baseline

**Files:** `e2e/helpers/agentWheelProbeScenario.ts`, its existing helper test,
and `e2e/agent-input-performance.test.ts` (new).

1. Add failing fixture assertions for opt-in echo and complete UTF-8 decoding.
2. Implement the smallest opt-in fixture extension; leave wheel assertions intact.
3. Add an isolated Electron scenario that records first terminal availability,
   keyboard-to-echo samples, Unicode text, and repeated hide/show/restoration.
4. Use the shared launch/quit helpers. Report sanitized numeric samples; do not
   read production profiles, send provider messages, or enable production CDP.
5. Run this scenario against the previously verified packaged executable and
   preserve the baseline report under `.tmp/e2e/`.

## Task 3: Confirmed Latency Optimization

**Files:** `src/renderer/hooks/useXterm.ts` and its hook tests.

1. Analyze baseline measurements and identify the specific avoidable wait.
2. Add a failing fake-timer regression for prompt output following user input,
   with assertions that ordinary output remains batched and busy writes ordered.
3. Expedite one response only when the surface is visible and interactive;
   clear the marker during lifecycle reset so old input cannot affect a new host.
4. Run all scoped tests and record the red/green evidence.

## Task 4: Compare and Verify

1. Build the isolated worktree using the existing native dependencies.
2. Run the same echo measurements on the new build and repeat the keyboard
   hibernation regression. Preserve reports and screenshots.
3. Run `pnpm typecheck`, tracked-file Biome checks, renderer theme checks,
   strict test-quality checks, and `git diff --check`.
4. Review lifecycle, instrumentation privacy, batching, and fixture cleanup.
5. Record exact results and any independent environment failures. Keep the
   installed production app untouched and report native IME/long-duration gaps.

## Progress

- [x] Capture diagnostics and establish the 188-test isolated baseline.
- [x] Complete startup and input timeline coverage.
- [x] Capture repeatable input-response baseline measurements.
- [x] Optimize the confirmed interactive delay with regressions.
- [x] Compare Electron measurements and run final verification.

## Verification Record

- Baseline: 188 tests passed across `useXterm`, AgentTerminal integration, and
  shared startup timeline utilities before any source changes.
- Timeline coverage: six new assertions failed before implementation; all 192
  hook and AgentTerminal integration tests then passed.
- Echo fixture: both echo/UTF-8 assertions failed before implementation; all
  three helper tests passed afterward.
- Packaged baseline: isolated Electron scenario passed with 12 initial echo
  samples, three panel switches, one hibernation restoration, and Unicode input.
  Initial samples had a conventional median of 53.55ms (the original report used
  an upper median of 54ms). Normal renderer output includes a 30ms batching delay.
- Interactive scheduling: four fast-response/write-order assertions failed
  before implementation; expiration and visibility compatibility cases passed.
  After implementation, all 200 scoped hook/integration/timeline tests and three
  fixture helper tests passed. Only one output within 500ms of visible input is
  expedited; normal output remains batched for 30ms and markers reset on hiding
  or initialization.
- Independent review identified premature retry-readiness telemetry. Four
  parameterized regressions (shell, Hapi, Claude IDE, and trust) failed before
  current-attempt tracking. An additional cancellation regression also failed
  before cleanup tracking. All 205 scoped tests passed after both corrections;
  the telemetry changes do not alter existing readiness gates.
- A repeat packaged baseline, after build/full-suite load ended, passed with an
  initial median of 53.6ms (12 samples), a post-switch median of 49.5ms (three
  samples), and a restored median of 53ms (five samples).
- The first full-suite run passed 3848 tests and failed one existing logo asset
  prerequisite test (`magick` unavailable). This preceded the five review-driven
  regression cases; those were freshly verified in the 205-test scoped run.
- Final production build and typecheck passed. The existing two-cycle hidden
  surface keyboard restoration Electron scenario passed (one selected test,
  six unrelated wheel scenarios skipped). It does not, by itself, prove that
  timer-driven hibernation occurred in this layout.
- Real-clock comparison passed: initial echo median 52.75ms -> 20.5ms (12 samples
  per run), panel-switch echo 60.7ms -> 21.2ms (three samples), and restored echo
  52.8ms -> 25.5ms (five samples). Initial maxima were 389ms and 200.2ms; occasional
  latency outliers remain. Virtual-clock restoration measurements were discarded
  from the comparison after inconsistent delays were observed.
- The new layout disposed the hidden surface in 217.9ms, so this fixture covers
  immediate surface restoration rather than real-time 60-second hibernation.
  The benchmark now records disposal timing and states this limitation.
- Final repeat after moving the pointer away from the floating project sidebar:
  initial median 21.85ms, switched median 22ms, restored median 21.8ms, Unicode
  echo 40ms. The screenshot visibly contains all echo lines and Unicode text.
  Hidden-surface disposal took 307.2ms, again confirming immediate restoration
  rather than verified timer-driven hibernation.
- Production package SHA-256 remains
  `696c9ff37d983bbd44df4dfa8f294d8ef1db6d7a9104dd3d985f84caa011b93b`.
  Primary `main` remains unchanged. Work is retained on the isolated branch;
  no merge, push, or installation was performed. Detailed results and remaining
  acceptance items are in `2026-10-09-agent-startup-performance-verification.md`.
- The independent full-suite ImageMagick prerequisite failure recorded in the
  previous repair remains outside this performance change.
