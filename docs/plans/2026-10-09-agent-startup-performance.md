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
- [ ] Complete startup and input timeline coverage.
- [ ] Capture repeatable input-response baseline measurements.
- [ ] Optimize the confirmed interactive delay with regressions.
- [ ] Compare Electron measurements and run final verification.

## Verification Record

- Baseline: 188 tests passed across `useXterm`, AgentTerminal integration, and
  shared startup timeline utilities before any source changes.
- The independent full-suite ImageMagick prerequisite failure recorded in the
  previous repair remains outside this performance change.
