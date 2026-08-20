## 1. Baseline and aggregate diagnostics

- [x] 1.1 Extend `SessionManager` and the existing main-process diagnostics collector with typed,
  aggregate-only load-control counters for managed sessions, suspended delivery, output batches,
  output characters, resyncs, and transcript pending bytes.
- [x] 1.2 Add `SessionManager` and diagnostics tests proving counters are non-negative and that
  serialized snapshots exclude terminal text, commands, paths, and credentials.
- [x] 1.3 Add a sanitized 60-second packaged-runtime measurement report under `scripts/` that
  records CPU, heap, active resources, queue counts, IPC counts, mounted-terminal count, and
  long-task count without collecting terminal payloads.
- [ ] 1.4 Capture baseline reports for one active agent, one active plus eleven hidden agents,
  four visible split terminals, local-supervisor high output, and remote high output; use those
  reports to set the documented hidden-idle and frame-budget constants.
- [x] 1.5 Verify with `pnpm vitest run src/main/services/session/__tests__/SessionManager.test.ts
  scripts/__tests__/session-diagnostics.test.ts` and `pnpm typecheck`.

## 2. Renderer activity scheduling contract

- [x] 2.1 Add or update shared IPC contracts, main session handlers, preload exposure, and typed
  renderer consumers required to observe aggregate activity scheduling without introducing a
  parallel persistent session store.
- [x] 2.2 Implement one renderer-window activity scheduler that registers and unregisters backend
  session observations from `AgentTerminal`, gives active visible sessions priority, and stops all
  activity requests while `document.visibilityState` is hidden.
- [x] 2.3 Make incoming session output immediately refresh observed activity state and retain
  low-priority polling only for visible sessions that have become stale.
- [x] 2.4 Add renderer tests for hidden-window suppression, active-session priority, output-driven
  activity updates, unmount cleanup, and restoration after `visibilitychange`.
- [x] 2.5 Verify with `pnpm vitest run src/renderer/components/chat/__tests__/useAgentSessionActivity.test.ts
  src/renderer/components/chat/__tests__/AgentTerminal.integration.test.ts src/preload/__tests__/sessionEventRouter.test.ts`.

## 3. Bounded supervisor and helper protocol input

- [x] 3.1 Add a pure TypeScript incremental JSON-line framer for `LocalSupervisorRuntime` with a
  documented maximum incomplete line size and a typed overflow error.
- [x] 3.2 Replace full-buffer `split('\n')` parsing in the local supervisor client with the bounded
  framer and route overflow through the existing disconnect and resubscription behavior.
- [x] 3.3 Apply equivalent bounded incremental JSON-line behavior to generated local-supervisor and
  remote-helper runtime sources, preserving valid chunk-spanning message order.
- [x] 3.4 Add unit and runtime tests for valid multi-chunk messages, oversized unterminated lines,
  affected-socket cleanup, reconnect behavior, and isolation from unrelated sessions.
- [x] 3.5 Verify with `pnpm vitest run src/main/services/session/__tests__/JsonLineBuffer.test.ts
  src/main/services/session/__tests__/LocalSupervisorRuntime.test.ts
  src/main/services/session/__tests__/LocalSupervisorSource.test.ts
  src/main/services/remote/__tests__/RemoteHelperSource.test.ts`.

## 4. Bounded and fair session output delivery

- [x] 4.1 Replace generated local-supervisor and remote-helper producer string concatenation with
  bounded chunk queues that track character count, preserve surrogate boundaries, and request one
  replay resync on high-water overflow.
- [x] 4.2 Preserve drain-before-exit semantics for every producer queue and add an explicit test
  that all queued output is delivered in order before `session:exit`.
- [x] 4.3 Extend `SessionOutputBatcher` with a per-window round-robin character budget that
  prioritizes the active visible session while preserving order inside each session stream.
- [x] 4.4 Ensure resync control events bypass ordinary output backlog and retain existing window
  suspension, detach, and cleanup semantics.
- [x] 4.5 Add stress tests for local, local-supervisor, and remote sessions covering overflow,
  UTF boundaries, multi-session fairness, resync deduplication, output order, and exit order.
- [x] 4.6 Verify with `pnpm vitest run src/main/services/session/__tests__/SessionOutputBatcher.test.ts
  src/main/services/session/__tests__/SessionManager.test.ts
  src/main/services/session/__tests__/LocalSupervisorSource.test.ts
  src/main/services/remote/__tests__/RemoteHelperSource.test.ts`.

## 5. Remote helper cache and watcher lifetime

- [x] 5.1 Define generated-runtime TTL and capacity constants for tmux scrollback and untracked
  diff-stat caches, then implement TTL-first LRU eviction.
- [x] 5.2 Tie watcher, active-search, cache, and client-write-state cleanup to final-client
  disconnect without changing active-client repository behavior.
- [x] 5.3 Add remote helper tests for expired-entry removal, deterministic LRU eviction, watcher
  cleanup, active-search cancellation, and cache clearing after the final disconnect.
- [x] 5.4 Verify with `pnpm vitest run src/main/services/remote/__tests__/RemoteHelperSource.test.ts
  src/main/services/remote/__tests__/RemoteConnectionManager.test.ts`.

## 6. Canvas terminal resource lifecycle

- [x] 6.1 Add a focused xterm hibernation controller that decides eligibility from active state,
  visibility, idle duration, selection state, and read-only transcript mode.
- [x] 6.2 Update `useXterm` to release xterm addons, WebGL renderer, resize observers, and live
  output delivery only after the controller marks a terminal hibernated; retain bounded replay,
  viewport, and supported search state in hook-owned refs.
- [x] 6.3 Restore a hibernated terminal by recreating its surface, enabling output delivery,
  applying replay or resync before live output, then restoring optional viewport and search state.
- [x] 6.4 Lower default worktree and workspace canvas-terminal mount limits without modifying valid
  persisted user settings or supported maximum values.
- [x] 6.5 Add tests for ineligible terminal states, resource disposal, output suppression during
  hibernation, replay-before-live restore order, viewport/search restoration, and settings
  migration compatibility.
- [x] 6.6 Verify with `pnpm vitest run src/renderer/hooks/__tests__/xtermHibernateController.test.ts
  src/renderer/hooks/__tests__/useXterm.test.ts
  src/renderer/stores/settings/__tests__/canvasTerminalMountLimitPolicy.test.ts`.

## 7. Packaged verification and release gate

- [x] 7.1 Run targeted local, supervisor, remote, preload, and renderer tests after all tasks and
  resolve output-integrity failures before broader verification.
- [x] 7.2 Run `pnpm typecheck`, `pnpm lint`, `pnpm test`, and `pnpm build`; record the exact output
  of any pre-existing unrelated quality-gate failure without changing its unrelated file.
- [ ] 7.3 With explicit approval before interrupting persistent sessions, restart a newly built app
  and execute the five baseline scenarios to produce before/after reports.
- [ ] 7.4 Accept the change only when the reports show no output-integrity regression and no
  increase in main CPU, renderer CPU, heap growth, IPC events, or long tasks for the same scenario.
- [ ] 7.5 Commit implementation work in reviewable conventional-commit units and retain the report
  artifacts with the final validation evidence.

## Validation notes

- 2026-08-20: `pnpm build` completed successfully.
- 2026-08-20: The final `pnpm typecheck` run was blocked by concurrent Codex workspace-history
  changes that import `CodexWorkspaceSessionHistory` while its module was unavailable. The affected
  files were `src/main/ipc/session.ts`, `AgentProviderSessionService.ts`,
  `CodexCapabilityProviderAdapter.ts`, `CodexRuntimeHomeService.ts`, and their workspace-history
  test.
- 2026-08-20: `pnpm lint` was blocked only by `.launch-code/state.json` formatting and
  `sidebarHoverRevealStylePolicy.test.ts` formatting, both outside this change.
- 2026-08-20: The final `pnpm test -- --reporter=dot` run reported five unrelated failures: the
  sidebar hover-reveal style policy test and four Codex workspace-history migration tests. The
  performance-focused target suites passed before and after the final formatting fixes.
- 2026-08-21: Isolated packaged validation is retained in
  `reports/2026-08-21-isolated-runtime-validation.md`. The one-active-agent scenario preserved
  output integrity and reduced renderer CPU growth, but slightly increased renderer and main heap
  growth versus the immediate pre-change baseline. The four-visible-terminal, Windows
  local-supervisor, and real-remote scenarios remain unexecuted, so the release gate is not met.
