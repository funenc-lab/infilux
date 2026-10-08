# Agent Startup and Input Performance Verification

## Scope

This change adds prerequisite-to-terminal timing and removes one confirmed
30ms renderer output wait after visible input. It does not certify real provider
cold startup, native operating-system IME, or production-wide performance.

The installed `/Applications/Infilux.app` was not replaced or restarted. No
messages were sent to real Codex or Claude sessions. The primary `main` worktree
remained unchanged; work is isolated on `perf/agent-startup-readiness`.

## Implementation

- One timeline covers existing shell, Hapi, Claude IDE, and trust prerequisites,
  attach, input-channel readiness, transcript loading, output activation, and
  surface readiness. Input and transcript contents are not logged by these stages.
- Retry readiness tracks current probes, rather than previous resolved state.
  Cancelled optional probes cannot retain pending telemetry.
- Only the next visible output within 500ms of an actual input send is expedited.
  Autonomous output keeps its 30ms batch delay. Existing serialization,
  backpressure, resync, and lifecycle ownership remain in place.

## Real-Clock Measurements

Both runs use fixture-owned PTYs, temporary profiles, and renderer-side
keydown-to-parsed-echo timing. Baseline uses the previously verified local
package; optimized uses the isolated repository build. These are descriptive
samples on a busy development machine, not a controlled production benchmark.

| Scenario | Samples Per Run | Baseline Median | Optimized Median | Final Repeat |
| --- | --- | --- | --- | --- |
| Initial echo | 12 | 52.75ms | 20.5ms | 21.85ms |
| After panel switches | 3 | 60.7ms | 21.2ms | 22ms |
| After surface restoration | 5 | 52.8ms | 25.5ms | 21.8ms |

Initial latency fell about 61% in this comparison. Initial sample ranges were
49.1-389ms and 18.7-200.2ms, respectively: occasional outliers remain. A single
Unicode insertion reached the fixture exactly once in each run, with echoes of
97.8ms and 36.8ms. One sample does not establish an IME latency distribution.
The final repeat had a 61.9ms initial maximum and a 40ms Unicode echo. Its
screenshot visibly contains initial, switched, restored, and Unicode echo lines.

Pending output batches/chars, resync sessions, and transcript append bytes were
zero at both end captures. This short workload does not establish leak freedom.
First-window values include Electron launch and automation connection and differ
between packaged and repository launches; they are not provider startup evidence.

The hidden surface disposed in 217.9ms and 307.2ms in the optimized runs. This layout exercises
immediate unmount/restoration, not a verified 60-second hibernation transition.
Virtual-clock restoration samples were excluded after inconsistent delays were
observed. Actual timer-driven hibernation remains covered by focused hook tests,
but is not proven by this performance fixture's Electron screenshot.

Artifacts under `.tmp/e2e/`:

- `agent-input-performance-baseline-real-time.json`
- `agent-input-performance-optimized-real-time.json`
- `agent-input-performance-optimized-final.json` and its inspected screenshot
- Corresponding screenshots and earlier exploratory reports

The benchmark moves its pointer away from the floating project sidebar so that
the terminal is not covered in final screenshots. Parsed-echo timing still does
not measure pixel painting.

## Verification

- TDD confirmed missing startup stages before implementation.
- Four accelerated response/write-order tests failed before scheduling changes;
  expiration and visibility compatibility checks remained passing.
- Four current-retry probe cases and one optional-probe cancellation case failed
  before telemetry ownership corrections.
- Final focused hook, AgentTerminal, and timeline tests: **205 passed**.
- Echo/UTF-8 fixture helper tests: **3 passed**.
- Final production build and typecheck: **passed**.
- Seven changed TypeScript files: Biome **passed**.
- Renderer theme and strict test-quality audits: **passed**.
- Existing two-cycle hidden-surface keyboard restoration Electron scenario:
  **passed**, with six unrelated scenarios excluded by the test-name filter.
- Baseline and optimized real-clock echo Electron scenarios: **passed**.
- Independent read-only review covered all seven implementation/test files and
  the implementation plan, with no remaining blocking findings; the reviewer independently passed all
  92 AgentTerminal integration cases.

The full default suite passed **3848 tests** and failed one existing logo asset
test because `magick` is unavailable. This run preceded the five review-driven
regressions, which were freshly verified in the final focused suite. The failure
was not disabled, and no global ImageMagick installation was performed.

## Remaining Acceptance

- Real Codex/Claude cold startup with provider authentication/network conditions
- Native IME composition and candidate-window interaction
- Repository switches in addition to panel/surface switches
- Pixel-level output checks and actual timer-driven Electron hibernation
- Long-duration, multi-session CPU/memory and latency workloads
- Resolving the independent ImageMagick test prerequisite before integration

The implementation is retained on its isolated branch. No push, merge, or
production installation is part of this round.
