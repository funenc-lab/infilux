## Context

See `proposal.md` for motivation and scope. CodeGraph traces the current high-frequency session
path as PTY or helper runtime output to `SessionManager`, then `SessionOutputBatcher`, preload IPC,
and `useXterm`. The recently committed baseline already batches output at 16ms, bounds per-window
pending delivery, suppresses hidden-panel output, and uses replay resynchronization.

Remaining structural pressure points are separate from that baseline: activity polling is selected
per terminal; local-supervisor JSON-line parsing retains an incomplete string; generated producer
queues concatenate output strings; canvas terminals remain mounted across panel switches; and
remote helper caches and watchers require explicit lifetime governance. `SessionManager` already
owns session identity and output delivery, `useXterm` owns xterm lifecycle, and existing
main-process diagnostics can collect aggregate counters.

## Goals / Non-Goals

**Goals:**
- Apply explicit bounded-resource behavior at the session producer, runtime transport,
  main-to-renderer delivery, and xterm lifecycle boundaries.
- Keep ownership aligned with existing session, preload, and renderer-hook boundaries.
- Make overflow and recovery deterministic and observable without collecting output content.

**Non-Goals:**
- Rebuild the terminal transport protocol, rewrite xterm, or replace existing persistence/replay.
- Add a renderer-side duplicate session state store or a global timer per terminal.
- Enable hibernation before output-restoration ordering is covered by tests.

## Decisions

### Use one renderer-window activity scheduler

Create a narrowly scoped renderer hook or service that owns one timer and a map of observed backend
session IDs. Each `AgentTerminal` registers visibility, activity priority, and recent output, then
unregisters on unmount. `visibilitychange` stops all polling while hidden and schedules immediate
re-evaluation on restore.

This keeps activity display state in its current owner while removing independent intervals. Real
session data remains authoritative for immediate activity changes. A central Zustand store is
rejected because activity observations are ephemeral terminal lifecycle state, not durable product
state.

### Introduce bounded incremental JSON-line framing

Add a small pure framing utility for the TypeScript local supervisor client. It stores only the
incomplete suffix, finds line terminators incrementally, and rejects a suffix over a documented
limit. Generated local-supervisor and remote-helper runtime sources implement the same behavior in
their embedded JavaScript because they cannot import the desktop TypeScript helper at runtime.

On overflow, clear parser state and destroy only that socket. Existing disconnect listeners,
resubscription logic, and session replay are the recovery extension points. A larger limit is not a
solution because it merely moves the memory-failure threshold.

### Represent producer output as bounded chunks

Replace generated-runtime queue strings with `{ chunks, charCount, timer }`. Each normal drain takes
at most one output chunk budget and preserves surrogate-pair boundaries. Reaching the producer
high-water mark discards incremental queued data and marks the delivery target for one replay
resync; it never extends the queue.

`SessionOutputBatcher` remains the main-to-renderer owner. Extend it with per-window round-robin
draining and a frame character budget, with active visible session priority. A global cross-window
queue is rejected because Electron window isolation and independent suspension make it a new shared
failure domain.

### Hibernate only renderer resources, never the session

`useXterm` gains a hibernation controller that releases the xterm instance, addons, observers, and
live output subscription after a hidden-idle threshold. The backend session remains attached and
continues to maintain its existing replay/archive behavior. Restoration creates the terminal first,
enables output delivery, waits for replay/resync, writes that data, and then allows live writes.

The controller retains replay, viewport, and search information in hook refs rather than a second
store. It excludes active, visible, selected, and read-only transcript surfaces. Lowering defaults
reduces new-user pressure without changing valid persisted limits.

### Bound remote cache and watcher lifetime explicitly

Remote helper caches gain TTL-first LRU eviction with small constants appropriate to interactive
repository use. Watcher ownership is tied to the final connected client so helpers do not retain
repository resources after disconnect. Cache values remain internal; only externally observable
freshness and cleanup behavior belong to the specification.

### Measure through existing diagnostics and packaged scenarios

Extend the existing diagnostics collector with count- and size-only session metrics. Add a
diagnostic script that samples process and session counters once per second for 60 seconds and
serializes a sanitized comparison report. Measurement is not a production timer and it never
persists terminal data.

## Ownership And Extension Points

| Boundary | Owner | Extension point | Failure or recovery behavior |
| --- | --- | --- | --- |
| Session identity and per-window delivery | `SessionManager` | Diagnostics snapshot and batcher priority input | Existing replay resync and window suspension |
| Supervisor connection | `LocalSupervisorRuntime` | Bounded line framer | Destroy subscription socket and use existing disconnect callbacks |
| Generated local/remote output producer | `LocalSupervisorSource`, `RemoteHelperSource` | Chunk queue and protocol-line limit | Bound data, close faulty client/socket, preserve replay path |
| Renderer activity observation | `AgentTerminal` and shared hook | Register and unregister terminal observations | Output event immediately refreshes state |
| xterm resources | `useXterm` and hibernation controller | Hibernate and restore state machine | Replay before accepting live output |
| Remote helper lifetime | Generated helper state | Cache eviction and final-client cleanup | Recreate caches/watchers on demand after reconnect |

## Risks / Trade-offs

- [Output loss or reordering on a limit] -> Use per-session ordering tests, surrogate-boundary
  tests, resync tests, and drain-before-exit tests for local and remote runtimes.
- [Activity indicator becomes stale] -> Prioritize output events, poll only observed visible
  sessions, and verify hidden-window suppression separately from visible-window correctness.
- [Terminal restoration feels slow] -> Keep a bounded replay context, restore active terminal
  first, and gate rollout on packaged interaction measurements.
- [Cache eviction increases remote latency] -> Evict expired entries before LRU entries and retain
  watcher-driven invalidation for active repositories.
- [Diagnostics expose user content] -> Use typed aggregate fields only and test report sanitization.

## Migration Plan

1. Land aggregate diagnostics and establish packaged baseline reports before behavior changes.
2. Land scheduler and bounded protocol/producer queue changes with focused unit and integration
   tests; retain existing replay and recovery contracts.
3. Land fair delivery after queue ordering tests pass for local and remote paths.
4. Land cache governance independently because it has no renderer compatibility dependency.
5. Enable xterm hibernation only after its restore-order tests and packaged measurements pass.
6. Package and measure the specified scenarios. Roll back the most recent commit if output
   integrity, persistent recovery, or interactive input regresses; hibernation can be disabled
   independently by keeping terminals live.

## Open Questions

- The exact hidden-idle duration and per-window frame budget will be calibrated from the baseline
  report. This does not change the specified correctness, boundedness, or restoration behavior.
