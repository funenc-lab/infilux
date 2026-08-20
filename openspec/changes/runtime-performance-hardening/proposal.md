## Why

Sustained agent output, split terminal layouts, and remote sessions multiply main-process IPC,
terminal rendering, activity polling, and runtime cache pressure. The existing output pipeline now
has batching and partial backpressure, but hidden-terminal work, protocol input buffers,
producer-side output queues, and terminal-instance lifetime still need explicit, verified budgets.

This work follows the completed output-pipeline baseline and diagnostics entry points. Further
optimization must be driven by packaged-runtime measurements rather than unverified micro-tuning.

## What Changes

- Add aggregate-only performance diagnostics for local and remote session queues, resyncs,
  transcript work, and mounted terminal pressure.
- Replace per-terminal agent activity polling with window-shared, visibility-aware scheduling;
  hidden windows will not issue activity polls.
- Establish explicit bounds, overflow recovery, and ordering guarantees for JSON-line input and
  producer-side session output queues in the local supervisor and remote helper.
- Apply fair output-delivery budgets to multiple visible sessions in the same window while
  prioritizing the active terminal.
- Add recoverable hibernation for hidden idle canvas xterm instances and lower default mount
  limits; restoration will use the existing replay and resync path.
- Apply expiry, capacity, and disconnect-cleanup rules to remote helper scrollback, diff-stat,
  and watcher resources.
- Add a packaged-runtime performance regression report that compares CPU, heap, IPC event, and
  long-task measurements before and after the change.

## Goals

- Reduce sustained resource consumption during multi-session pressure without losing output,
  breaking persistent-session recovery, or changing local and remote session semantics.
- Make protocol buffers, output queues, caches, and xterm instances explicitly bounded and
  auditable.
- Provide repeatable, content-free evidence for future performance decisions.

## Non-goals

- Change terminal commands, agent-provider configuration, persisted-session data, or remote
  connection authentication.
- Add runtime dependencies, external telemetry, or terminal-content collection.
- Promise machine-independent absolute CPU or frame-rate values; acceptance compares the same
  packaged build and scenario before and after the change.

## User Impact

- Active terminal input and output remain prioritized. Restoring a hidden terminal can require a
  brief rebuild, but it retains usable replay context.
- Hidden windows stop issuing activity-detection requests. Real output updates activity state
  immediately; quiet background indicators can update at a lower priority.
- Malformed or oversized runtime protocol messages disconnect only the affected transport and use
  established recovery behavior instead of consuming unbounded memory.

## Risks

- Stricter buffer limits can reconnect an abnormal peer sooner, so replay and exit ordering must
  be tested.
- Fair delivery and terminal hibernation can add background-terminal latency, requiring active
  terminal priority and ordered restoration.
- Cache limits can increase remote Git or tmux work, requiring TTL, LRU, and watcher invalidation
  to balance freshness and latency.

## Measurable Acceptance Criteria

- A hidden window issues zero session-activity IPC requests during a 60-second observation window.
- Every added queue, protocol-line buffer, and remote cache has a constant limit, overflow or
  eviction test, and lifecycle-cleanup test.
- Stress tests show no duplicated or missing output, UTF boundary corruption, or `session:exit`
  emitted before queued output.
- For the same packaged runtime and scenarios, main-process CPU, renderer CPU, heap growth, IPC
  event count, and long-task count do not exceed the recorded baseline. Any output-integrity
  regression blocks release.
- Local and remote sessions pass recovery, hide/restore, disconnect, and high-output scenarios.

## Capabilities

### New Capabilities
- `session-runtime-load-control`: Provides visibility-driven activity scheduling, bounded
  protocol/output queues, fair output delivery, and aggregate performance diagnostics for local
  and remote sessions.
- `terminal-resource-lifecycle`: Provides bounded canvas-terminal mounting, hidden-idle
  hibernation, and replay-based restoration for xterm sessions.

### Modified Capabilities
- None. This project has no existing OpenSpec capability specifications.

## Impact

- Affected code: `src/main/services/session/`, `src/main/services/remote/RemoteHelperSource.ts`,
  `src/main/ipc/session.ts`, `src/preload/`, `src/shared/types/`,
  `src/renderer/components/chat/`, `src/renderer/hooks/useXterm.ts`, and terminal settings policy.
- Affected systems: local PTY, local supervisor, remote helper, main-to-renderer IPC, xterm/WebGL,
  persistent-agent replay recovery, and remote watchers/caches.
- Compatibility: no external API beyond typed IPC additions. Existing session, replay, and remote
  protocol behavior retains its recovery semantics when a limit is exceeded.
- Dependencies: none added; the change uses existing Electron, React, Zustand, xterm, Vitest, and
  main-process diagnostics infrastructure.
