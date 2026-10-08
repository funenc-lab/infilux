# Codex Tmux Wheel Scrolling Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make wheel input navigate Codex's full-screen conversation inside tmux without changing normal-buffer tmux history scrolling.

**Architecture:** Extend the existing Claude-specific alternate-buffer override in the pure renderer wheel policy to recognize Codex through the same base-ID helper. The hook already dispatches `program-scroll` to session input and `host-scroll` to tmux, so its transport needs no implementation change.

**Tech Stack:** TypeScript, xterm.js, React hook, Vitest, pnpm.

---

Before editing, read `src/renderer/AGENTS.md`, `src/renderer/hooks/AGENTS.md`, and `src/renderer/hooks/__tests__/AGENTS.md`; check `git status --short --branch`. Follow @test-driven-development, @systematic-debugging, and @verification-before-completion. Do not interact with live Codex or tmux sessions.

### Task 1: Reproduce the Codex routing failure

**Files:**
- Modify: `src/renderer/hooks/__tests__/xtermWheelPolicy.test.ts`
- Test: `src/renderer/hooks/__tests__/xtermWheelPolicy.test.ts`

**Step 1: Write the failing regression.** Add a parameterized case for `codex` with upward wheel input and `codex-happy` with downward input, both in `alternate` with tmux and mouse tracking enabled. Expect `program-scroll`, Page Up (`\x1b[5~`) or Page Down (`\x1b[6~`), and repeat 1 for four line steps. Add a second assertion that `codex` in `normal` with tmux still produces `host-scroll`.

```ts
it.each([
  ['codex', -4, '\x1b[5~'],
  ['codex-happy', 4, '\x1b[6~'],
])('scrolls %s alternate-buffer history in the program', (agentId, deltaY, sequence) => {
  expect(resolveAgentWheelPolicy({
    agentId, kind: 'agent', activeBufferType: 'alternate', mouseTrackingMode: 'any',
    hostScrollMode: 'tmux', deltaMode: DOM_DELTA_LINE, deltaY, carryY: 0,
  })).toEqual({ action: 'program-scroll', carryY: 0, sequence, repeat: 1 });
});
```

**Step 2: Verify RED.** Run `pnpm exec vitest run src/renderer/hooks/__tests__/xtermWheelPolicy.test.ts`. Expected: the new Codex cases fail with `action: 'host-scroll'` while the existing cases pass.

### Task 2: Fix the policy and verify its transport

**Files:**
- Modify: `src/renderer/hooks/xtermWheelPolicy.ts:119-160`
- Modify: `src/renderer/hooks/__tests__/useXterm.test.ts`
- Test: `src/renderer/hooks/__tests__/xtermWheelPolicy.test.ts`
- Test: `src/renderer/hooks/__tests__/useXterm.test.ts`

**Step 1: Add a hook regression.** Follow the adjacent `scrolls tmux-backed agent output through the host scrollback` test: mount a tmux-backed agent with `agentId: 'codex'`, have the mocked wheel policy return `{ action: 'program-scroll', carryY: 0, sequence: '\x1b[5~', repeat: 1 }`, dispatch an upward wheel event, then assert `sessionWrite` received Page Up and `tmuxScrollClient` was not called. This validates the existing transport contract without changing `useXterm.ts`.

**Step 2: Verify RED for the pure policy.** Rerun the Task 1 test and confirm it still fails for the same action mismatch. The hook regression is expected to pass because the transport already supports the new decision; do not modify its implementation.

**Step 3: Implement the minimal fix.** Replace the Claude-only predicate with one for either supported full-screen agent and check it before tmux host routing:

```ts
const isProgramScrollableAlternateBuffer =
  kind === 'agent' &&
  activeBufferType === 'alternate' &&
  typeof agentId === 'string' &&
  (getAgentInputBaseId(agentId) === 'claude' ||
    getAgentInputBaseId(agentId) === 'codex');
```

Use this predicate in both the `shouldRemapWheel` condition and the existing program-scroll branch. Keep other branches and normalization unchanged.

**Step 4: Verify GREEN.** Run `pnpm exec vitest run src/renderer/hooks/__tests__/xtermWheelPolicy.test.ts src/renderer/hooks/__tests__/useXterm.test.ts`. Expected: both suites pass. If they fail, investigate before making additional changes.

**Step 5: Commit the focused change.** Run `git add src/renderer/hooks/xtermWheelPolicy.ts src/renderer/hooks/__tests__/xtermWheelPolicy.test.ts src/renderer/hooks/__tests__/useXterm.test.ts` followed by `git commit -m "fix: scroll Codex alternate-buffer history inside tmux"` after the checks pass.

### Task 3: Validate and hand off

**Files:**
- No new files expected.

**Step 1: Run quality gates.** Run `pnpm typecheck`, `pnpm lint`, and `pnpm test`. Expected: exit code 0 for each, with test totals from fresh output.

**Step 2: Check scope.** Run `git status --short --branch` and `git show --stat --oneline HEAD`; ensure no unrelated edits and no live session restart.

**Step 3: Report.** Explain that the code fix is ready but the existing installed Infilux app keeps running its previous renderer until the next build/deployment/relaunch; do not force-close or replace an app with live sessions.
