# Replay Snapshot Budget Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Bound renderer replay-snapshot work during output bursts without dropping backend output or changing replay ordering.

**Architecture:** Keep `useXterm` as the owner of transient replay-snapshot state. Accumulate output chunks with a 256 Ki-code-unit budget, flush the complete pending batch when its budget is reached, and retain the existing timer, exit, unmount, and restore flush paths. The threshold triggers draining, not truncation: the triggering chunk is included in full. Ordinary session IPC output chunks are already bounded to 64 Ki code units. The terminal output buffer and persistent transcript remain unchanged.

**Tech Stack:** React hooks, TypeScript, Vitest, xterm.js, Electron renderer.

---

### Task 1: Add the regression test

**Files:**
- Modify: `src/renderer/hooks/__tests__/useXterm.test.ts`
- Test: `src/renderer/hooks/__tests__/useXterm.test.ts`

**Step 1:** Add a test that sends enough output chunks to exceed the replay snapshot batch budget and asserts one snapshot append occurs before the normal 500ms timer.

**Step 2:** Run the focused test and confirm it fails because the current implementation waits for the timer.

### Task 2: Implement bounded replay snapshot draining

**Files:**
- Modify: `src/renderer/hooks/useXterm.ts`

**Step 1:** Add a renderer-local batch character budget and track pending replay characters.

**Step 2:** Drain pending chunks in bounded batches while preserving chunk order and parser state; keep the existing timer and forced flush behavior.

**Step 3:** Run the focused test and the complete `useXterm` suite.

### Task 3: Verify the change

**Files:**
- No additional source files.

**Step 1:** Run the related renderer and session regression suites.

**Step 2:** Run `pnpm typecheck`, `pnpm lint`, and `git diff --check`.

**Step 3:** Record remaining full-suite/environment limitations without changing unrelated files.

## Implementation Evidence

- The budget regression failed before the change and passed after it.
- The budget regression now checks retained tail order, the second batch counter reset, and cancellation of the previous append timer.
- Review identified an initialization race between pending live output and asynchronous transcript loading. A regression reproduced stale history being written before the first live terminal write. Initialization now drains pending snapshot output before the replay decision and keeps the live snapshot when history is suppressed.
- The initialization regression passes and verifies that live output is written once and retained on unmount.
- The seven related renderer/session suites passed: 323 tests. Independent review reported no remaining blocking findings.
- Fresh type checking, Biome, renderer theme auditing, test quality auditing, and `git diff --check` passed. The two concurrently changed sidebar suites also passed: 19 tests.
- The final production build completed using the existing Electron Node runtime and unchanged build configuration. The macOS x64 directory package completed without rebuilding native dependencies; its terminal asset matches the build output byte-for-byte.
- The final package was installed at `/Applications/Infilux.app`. Its archive SHA-256 is `2b774a79fa237d95e1beefcaae0a60ff8c8ee98b333d4e5490f6d0f692262a74`; the previous installed package is retained at `/Applications/Infilux.app.backup-20261013-115621`.
- A packaged-app CDP smoke check confirmed a complete renderer document, seven mounted terminals, enabled non-read-only terminal textareas, working bridge/diagnostic APIs, and a nonblank screenshot. No messages were sent to existing agent sessions.
- A 15-second diagnostic sample collected 11 samples while live sessions were producing output. It delivered 257 output batches and 231,536 characters; pending output ended at zero and output resynchronization stayed at zero. Renderer CPU averaged 23.51%, with eight long tasks totaling 1,156ms. These startup/active-output observations are not a controlled before/after baseline or evidence that all performance work is complete.
- Pre-install diagnostics are retained under `.tmp/diagnostics/performance-20261013-before-final`; the installed-app screenshot is `/tmp/infilux-final-verification.ViVXxh/installed-app.png`.
- The temporary CDP session was closed, port 9222 was confirmed closed, and the final installed app was relaunched normally and remained alive for more than one minute. Post-install diagnostics are retained under `.tmp/diagnostics/performance-20261013-final`.
- The managed-log tail includes an earlier `Tmux host session recovery failed` entry at 10:45:43, before the final package installation. The smoke check does not establish acceptance of every missing-host recovery case or the full startup log history.
- Full baseline scenario acceptance and local/remote helper replay optimization are outside this renderer-only step; they remain pending.
