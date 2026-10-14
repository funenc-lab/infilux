# Agent Scroll Ownership Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Keep agent scrolling, history controls, and input delivery consistent without overriding native agent mouse handling.

**Architecture:** Extend the existing xterm wheel policy with one scroll owner per terminal mode. Keep plain text history local, delegate native mouse reporting, and serialize managed tmux history operations with input and return-to-live actions. Check the actual tmux pane alternate-screen state before entering copy mode; preserve the existing local/remote IPC surface.

**Tech Stack:** React, TypeScript, xterm.js, Electron IPC, tmux, Vitest, Playwright Electron E2E.

**Progress:** Tasks 1-4 complete. All 483 focused unit/integration tests, five final-build Electron scenarios, typecheck, targeted Biome checks, and the production build pass. The installed app was not updated.

---

## Constraints

- Preserve the current user-owned replay, session persistence, and output batching changes.
- Apply the approved fix in the current workspace so those uncommitted changes remain part of the verified implementation.
- Commit only task-scoped changes when explicitly requested. Do not package, replace the installed app, or operate live user agent sessions.
- Preserve shell-terminal behavior and local/remote parity.
- Do not send arbitrary page keys to unidentified interactive programs.
- Do not expose local scrollbar or return-to-bottom state as if it represented a native program's scroll position.

### Task 1: Reproduce Scroll Ownership Conflicts

**Files:**
- Modify: `src/renderer/hooks/__tests__/xtermWheelPolicy.test.ts`
- Modify: `src/renderer/hooks/__tests__/useXterm.test.ts`
- Modify: `src/renderer/components/chat/__tests__/AgentTerminal.integration.test.ts`
- Modify: `src/main/services/cli/__tests__/TmuxDetector.test.ts`
- Modify: `src/main/services/remote/__tests__/RemoteHelperSource.test.ts`

1. Add failing assertions for native mouse delegation in both buffers and for local normal-buffer history in managed tmux sessions.
2. Verify that small page-scroll fallback deltas accumulate before emitting a page key and that unknown programs receive no invented keys.
3. Hold a tmux upward-scroll request open, type input, and assert that input is not delivered until copy mode has been canceled.
4. Assert that host history exposes the correct return-to-live button and that native mode hides unrelated local controls.
5. Test actual generated remote tmux functions, not only source-string presence, against an alternate-screen pane.

Run: `NODE_OPTIONS=--no-experimental-webstorage pnpm --config.manage-package-manager-versions=false exec vitest run src/renderer/hooks/__tests__/xtermWheelPolicy.test.ts src/renderer/hooks/__tests__/useXterm.test.ts src/renderer/components/chat/__tests__/AgentTerminal.integration.test.ts src/main/services/cli/__tests__/TmuxDetector.test.ts src/main/services/remote/__tests__/RemoteHelperSource.test.ts --maxWorkers 2`

Expected: the new assertions fail against the current implementation for ownership, cancellation order, and native alternate-screen protection.

### Task 2: Implement Mode-Aware Routing And Tmux Protection

**Files:**
- Modify: `src/renderer/hooks/xtermWheelPolicy.ts`
- Modify: `src/shared/types/tmux.ts`
- Modify: `src/main/services/cli/TmuxDetector.ts`
- Modify: `src/main/services/remote/RemoteHelperSource.ts`

1. Introduce the pure scroll-owner decision next to the existing wheel policy.
2. Prioritize native mouse reporting unless the app is already browsing managed host history.
3. Keep normal-buffer scrollback local so wheel and scrollbar positions agree.
4. Limit keyboard paging to established Claude/Codex fallback capabilities, retaining partial page carry.
5. Add an optional alternate-screen indicator to the existing typed tmux result.
6. Read actual pane alternate-screen state before entering history mode; refuse to nest copy mode over a native interactive screen. Recheck state when canceling copy mode.
7. Implement the same protection in the generated remote helper without changing its unrelated replay work.
8. Restore outer tmux alternate-screen and mouse modes in local screen replay independently of the pane's buffer and mouse encoding. Electron regressions reproduced lost host history on quiet normal panes, and native wheel failures after restoring plain captured cells. Keep actual pane alternate-screen state separate for the copy-mode guard.

Run the Task 1 command and focused local/remote backend tests. Expected: ownership and backend-protection regressions pass.

### Task 3: Serialize History, Input, And Return-To-Live

**Files:**
- Create: `src/renderer/hooks/xtermHostScrollController.ts`
- Create: `src/renderer/hooks/__tests__/xtermHostScrollController.test.ts`
- Modify: `src/renderer/hooks/useXterm.ts`
- Modify: `src/renderer/components/chat/AgentTerminal.tsx`

1. Extract the host scroll queue into a small controller with injected IPC and explicit disposal.
2. Coalesce wheel requests using the existing 16 ms batching window, then serialize them.
3. Returning live invalidates queued scroll requests and runs after any in-flight request.
4. Typing while browsing host history cancels copy mode before sending input, preserving input order. Failed cancellation must not silently deliver input into history mode.
5. Expose owner and managed host-history state from `useXterm`; reset those states on rebind, hibernation, and teardown.
6. Route the existing bottom button to the correct owner. Disable local selection auto-scroll outside local-history mode.
7. Hide only the app-local scrollbar for native/host ownership, with component-scoped styling that leaves xterm sizing intact.

Add tests for queued direction changes, invalidation, disposal, failed cancellation, and input order. Run focused tests, then typecheck and formatting checks.

### Task 4: Verify Actual Electron Interactions

**Files:**
- Modify: `e2e/helpers/agentWheelProbeScenario.ts`
- Modify: `e2e/agent-wheel-scroll.test.ts`

1. Extend the isolated probe with an interactive alternate-screen mode and native wheel logging.
2. Verify real wheel input reaches the native program without synthesized paging or host copy mode.
3. Verify ordinary transcript wheel scrolling and scrollbar dragging use the same viewport and return to the newest output.
4. Verify managed host-history scrolling returns live and preserves subsequent typed input.
5. Capture screenshots and process logs from the isolated repository build. Never launch the installed production app.

Run: `pnpm --config.manage-package-manager-versions=false build`

Run: `NODE_OPTIONS=--no-experimental-webstorage pnpm --config.manage-package-manager-versions=false exec vitest run --config vitest.e2e.config.ts e2e/agent-wheel-scroll.test.ts`

Expected: focused scroll scenarios pass and all scenario resources are cleaned up.

### Final Verification

- Run the relevant hook, component, backend, preload contract, and helper tests.
- Run `pnpm --config.manage-package-manager-versions=false typecheck` and targeted Biome checks.
- Review only this change's diff, excluding the pre-existing user-owned work.
- Report verified behavior and any verification limitation without claiming the installed app has been updated.

### Verification Results

- The 12-file focused Vitest run passed all 483 tests, including local/remote tmux protection, scroll ownership, serialized input, recovery, and preload contracts.
- Typecheck passed. Biome checked all 15 changed TypeScript implementation/test files with no errors. The Electron production build passed.
- The initial full 12-scenario Electron run passed 11 scenarios and reproduced the quiet normal-pane restoration bug. Regression tests then reproduced both the missing outer alternate buffer and legacy mouse encoding issues before the final fix.
- After the final fix and rebuild, five Electron scenarios passed: native direct scrolling, native tmux scrolling, managed history return-to-live and input, local scrollbar dragging, and repeated hibernation keyboard input. Seven other scenarios were not rerun after that final mode-restoration change.
- Fresh native and managed-history screenshots were inspected. Scenario cleanup completed through the existing fixture hooks.
- Read-only review found no remaining task-scoped issues. Pre-existing replay/session changes were preserved and excluded from the implementation review.
- Before the requested scoped commit, an isolated snapshot of the Git index passed all 478 relevant tests, typecheck, and Biome checks. This excludes five tests owned by the unrelated uncommitted replay changes from the earlier 483-test workspace run.
- Initial implementation verification performed no commit, package installation, or live user-session operation. The subsequent user request authorizes a scoped local commit only.
