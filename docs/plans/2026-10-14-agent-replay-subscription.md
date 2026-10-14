# Agent Replay Subscription Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Isolate AgentPanel layout from replay updates without losing terminal recovery or retained history.

**Architecture:** Keep the existing session store as the source of truth. Project metadata for AgentPanel and select retained replay in terminal/history leaf adapters. Preserve existing replay timers, persistence, input callbacks, and mount identity.

**Tech Stack:** React 19, TypeScript, Zustand, Vitest, jsdom.

---

This is an approved continuation in the existing dirty workspace. Preserve the
index and unrelated modifications. No commits, branch changes, installations, or
app restarts are part of this execution. Use command-level NODE_OPTIONS to avoid
the current Node global Web Storage conflict in jsdom tests.

### Task 1: Reproduce Replay Render Fan-Out

**Files:**
- Modify: `src/renderer/components/chat/__tests__/AgentPanel.integration.test.ts`

1. Record panel and terminal render calls in the existing boundary test doubles.
2. Add tests for tab, canvas, and global-canvas with two mounted sessions.
3. Emit a replay update from one terminal using its real panel callback. Assert
   that only its replay prop updates and the other terminal/panel do not render.
4. Add a timestamp-only case and retained-history fallback coverage.
5. Run the file with one worker; verify the render-scope assertions fail while
   existing behavior assertions remain valid.

```sh
NODE_OPTIONS=--no-webstorage pnpm exec vitest run src/renderer/components/chat/__tests__/AgentPanel.integration.test.ts --maxWorkers=1 --no-file-parallelism
```

### Task 2: Isolate Metadata And Replay Consumers

**Files:**
- Create: `src/renderer/hooks/useAgentSessionMetadata.ts`
- Create: `src/renderer/components/chat/agent-panel/AgentSessionReplayViews.tsx`
- Modify: `src/renderer/components/chat/AgentPanel.tsx`

1. Add a memoized selector following useAgentSessionSummaries' local caching
   pattern, with `Omit<Session, 'replaySnapshot' | 'replaySnapshotCapturedAt'>`.
2. Project with object rest, compare equal metadata using shallow, and reuse the
   previous array when all metadata references are unchanged. Keep only the
   latest source array and projection.
3. Add a terminal adapter selecting `sessions.find(s => s.id === id)?.replaySnapshot`.
4. Add a transcript adapter selecting replay text and capture time with
   useShallow only while the drawer is open. Merge those fields into its metadata
   before calling the existing drawer, preserving live-store precedence.
5. Replace AgentPanel's full sessions selector and direct component imports with
   the adapters. Remove the replay prop derived from panel metadata. Preserve the
   existing JSX component names through import aliases and keep mount keys intact.
6. Rerun Task 1 and the transcript/replay tests; expect all to pass.

### Task 3: Cover Metadata And Recovery Boundaries

**Files:**
- Create: `src/renderer/hooks/__tests__/useAgentSessionMetadata.test.ts`
- Modify: `src/renderer/components/chat/__tests__/AgentPanel.integration.test.ts`

1. Test omitted replay, stable references, preserved metadata fields, membership,
   ordering, and unsubscribe behavior against the real store.
2. Test deferred terminal mount reading the latest retained replay.
3. Test drawer fallback after startup and subsequent retained replay changes,
   without causing unrelated terminal or parent renders.
4. Keep worktree switching, recovery, floating focus, and split/merge assertions
   from the existing integration suite passing.

### Task 4: Verify And Review

1. Run focused suites covering the new hook, panel, drawer, summaries, persistence,
   recovery, and layout. Use one worker and no file parallelism.
2. Run `pnpm lint`, `pnpm typecheck`, and `git diff --check`.
3. Request read-only review of the exact changed files, fix important findings
   with regression tests, and rerun affected gates.
4. Update `.tmp/diagnostics/performance-20261014-agent-panel/analysis.md` with red/
   green results and limits. Verify the existing app and ten tmux panes remain
   alive. Report source verification separately from installed-app performance.

## Status

- Design and baseline evidence: complete (82 baseline tests passed).
- Task 1: complete (four new render-scope assertions failed as expected; 69 existing tests passed).
- Task 2: complete (four settled render-scope tests pass; restoring the old selector reproduces all four failures).
- Task 3: complete (five focused files passed: 115 tests, including deferred mount and transcript fallback/live priority).
- Task 4: complete (24 files and 369 tests pass; lint, typecheck, and diff checks pass; read-only review has no blocking findings; installed app and ten original tmux panes remain alive).
