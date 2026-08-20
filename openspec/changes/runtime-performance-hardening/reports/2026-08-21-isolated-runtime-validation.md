# Isolated Runtime Validation

## Scope

- Baseline commit: `26230a2` (`feat(sidebar): streamline project worktree navigation`), immediately before the runtime-performance change commits.
- Initial candidate commit: `ad28e97` with the runtime-performance change commits included.
- Follow-up candidate commit: `b0c44b9` (`perf(chat): coalesce output activity scheduling`).
- Platform: macOS arm64, Electron 39.2.7.
- Runtime isolation: a dedicated temporary `HOME`, `USERPROFILE`, Chromium user-data directory, `INFILUX_RUNTIME_CHANNEL=dev`, and `ENSOAI_PROFILE=runtime-performance`.
- Sampling: local loopback CDP only, 60 seconds, 5-second interval, aggregate-only diagnostics.

The benchmark never used an existing project, agent, provider configuration, terminal command, or remote connection. Generated terminal data used deterministic line prefixes and sequence numbers. The report retained only aggregate metrics and output-integrity counters.

## One active agent before follow-up repair

| Metric | Baseline | Candidate | Result |
| --- | ---: | ---: | --- |
| Renderer CPU delta | +0.006% | -0.004% | Improved |
| Renderer heap delta | +2,128,660 B | +2,167,868 B | Increased by 39,208 B |
| Main heap delta | +877,340 B | +896,980 B | Increased by 19,640 B |
| Session IPC delta | 0 | 0 | No regression |
| Long tasks | 0 | 0 | No regression |
| Resync sessions | 0 | 0 | No regression |
| Output integrity | 6,300 / 6,300 ordered lines | 6,300 / 6,300 ordered lines | Passed |

The candidate does not meet the strict no-heap-growth release criterion for this scenario. The increase is small, but this report does not classify it as noise or waive the criterion.

## One active agent after follow-up repair

The renderer activity scheduler previously rebuilt and rearmed a timer for every output event. The
follow-up repair retains an earlier check, then reevaluates the current output-staleness deadline
when that check runs. A focused regression test drives 100 consecutive output events and verifies
that only one timer is armed before time advances.

| Metric | Baseline | Follow-up candidate | Result |
| --- | ---: | ---: | --- |
| Renderer CPU delta | +0.006% | -0.014% | Improved |
| Renderer heap delta | +2,128,660 B | +2,099,364 B | Improved by 29,296 B |
| Main heap delta | +877,340 B | +922,672 B | Increased by 45,332 B |
| Session IPC delta | 0 | 0 | No regression |
| Long tasks | 0 | 0 | No regression |
| Resync sessions | 0 | 0 | No regression |
| Output integrity | 6,300 / 6,300 ordered lines | 6,300 / 6,300 ordered lines | Passed |

This repair removes the renderer heap-growth regression in the measured scenario and preserves
output integrity. Main-process heap remains above the single baseline sample, so the strict release
criterion is still not met and this report does not classify the difference as noise.

## One active plus eleven hidden agents

| Metric | Candidate |
| --- | ---: |
| Hidden output-delivery sessions | 11 |
| Renderer CPU delta | -0.008% |
| Renderer heap delta | +2,610,228 B |
| Main heap delta | -447,100 B |
| Session IPC delta | 0 |
| Long tasks | 0 |
| Resync sessions | 0 |
| Output integrity | 8,400 / 8,400 ordered lines |

This validates that hidden delivery stays suspended while transcripts preserve ordered output. It is not a substitute for the four-visible-split-terminal scenario.

## Unexecuted required scenarios

- Four visible split terminals: no isolated workspace fixture was available to drive the real multi-pane terminal UI without importing user projects or state.
- Local-supervisor high output: the local-supervisor runtime is selected only on Windows; this macOS validation environment cannot exercise that production path.
- Remote high output: no disposable authenticated SSH endpoint was available. A real remote connection is required because a synthetic renderer-side substitute would not verify the remote helper transport, caches, or watcher cleanup.

## Automated verification

```text
pnpm typecheck
pnpm vitest run scripts/__tests__/runtimePerformanceDiagnostics.test.ts \
  src/main/services/session/__tests__/SessionOutputBatcher.test.ts \
  src/main/services/session/__tests__/SessionManager.test.ts \
  src/main/services/remote/__tests__/RemoteHelperSource.test.ts \
  src/renderer/hooks/__tests__/xtermHibernateController.test.ts \
  src/renderer/hooks/__tests__/useXterm.test.ts
```

Result: typecheck passed; the follow-up targeted suite passed with 122 tests, the full suite passed
with 601 test files and 3,451 tests, and `pnpm build` passed. Expected fault-injection logs from
session and WebGL fallback tests were emitted without test failures. `pnpm lint` remains blocked
only by the pre-existing `.launch-code/state.json` trailing-newline formatting difference.

## Release decision

Not accepted. Complete the three unexecuted production scenarios and resolve or explain the
measured main-process single-agent heap-growth increase before marking the OpenSpec change complete.
