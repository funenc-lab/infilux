# Helper Replay Buffer Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove full replay-string reconstruction from incremental output appends in the generated local supervisor and remote helper.

**Architecture:** A shared generated JavaScript chunk buffer owns each helper session's bounded replay. Existing ANSI parsing and UTF-16 boundary rules determine safe eviction. Replay strings are materialized only for attach, snapshot, resync, and activation responses; IPC payloads and replay-length semantics remain unchanged.

**Tech Stack:** TypeScript, generated Node.js runtime source, Vitest, Electron Vite, Electron Builder.

---

## Scope And Safety

- Continue in the current workspace to preserve the previously approved, uncommitted performance fixes. Do not revert or stage unrelated work.
- Do not restart or replace the running production application, interrupt persistent sessions, or send messages to real agent providers.
- Build and package a candidate without installing it. Test generated runtimes with isolated fixtures.
- This hotspot affects the Windows local supervisor and remote helper. It does not establish the cause of macOS renderer long tasks.
- The broader OpenSpec Windows, real-SSH, and multi-terminal performance acceptance gates remain pending.
- Commits, pushes, and production installation require a separate user request.

## Task 1: Establish Lazy Replay Regression Tests

**Files:**
- Modify: `src/main/services/session/__tests__/LocalSupervisorSource.test.ts`
- Modify: `src/main/services/remote/__tests__/RemoteHelperSource.test.ts`

- [x] Add tests that append output, require a canonical replay buffer, and verify subsequent appends do not call its `toString()` method.
- [x] Verify explicit replay reads preserve output order and length.
- [x] Run the focused tests and observe assertion failures because the old helpers retain only a replay string (2 expected failures, 37 existing tests passed).

Run:

```bash
env NODE_OPTIONS=--no-experimental-webstorage node node_modules/vitest/vitest.mjs run src/main/services/session/__tests__/LocalSupervisorSource.test.ts src/main/services/remote/__tests__/RemoteHelperSource.test.ts
```

## Task 2: Implement Shared Generated Replay Storage

**Files:**
- Create: `src/main/services/session/SessionReplayBufferSource.ts`
- Create: `src/main/services/session/__tests__/SessionReplayBufferSource.test.ts`
- Modify: `src/main/services/session/LocalSupervisorSource.ts`
- Modify: `src/main/services/remote/RemoteHelperSource.ts`
- Modify: both source test files from Task 1

- [x] Generate a chunk-buffer implementation based on `SessionReplayBuffer`, using the helpers' existing parser functions.
- [x] Replace internal string/parser-state session fields with one replay buffer.
- [x] Use `.append(chunk)` on output paths; use `.length` without materialization for activation bounds.
- [x] Materialize strings at attach, snapshot, resync, and attach activation read points only.
- [x] Adapt fixtures to initialize replay through actual append functions, retaining payload-level `replay` fields.
- [x] Test capacity, order, fragmented ANSI sequences, split surrogate pairs, oversized chunks, empty appends, and parser state after eviction.
- [x] Verify the generated source compiles and focused tests pass (59 tests).

Test-driven boundary corrections made during the port:

- Exact-capacity chunk replacement must recognize a surrogate pair split across the old and incoming chunk.
- ANSI boundary adjustment must not leave a low surrogate whose preceding high surrogate was discarded.
- Consumed chunks release their string references immediately, independently of array compaction.
- Array compaction waits until at least half the entries are consumed (and at least 32 entries), amortizing repeated small appends.

Each correction had a failing regression test before its implementation. The shared parser and existing main-process `SessionReplayBuffer` remain unchanged in this helper-only change.

## Task 3: Verify And Record The Candidate

**Files:**
- Update: this plan with verification evidence

- [x] Run session, terminal, remote-helper, and renderer terminal regression tests (526 tests across 27 files).
- [x] Run TypeScript, Biome, theme, and test-quality audits without triggering dependency installation.
- [x] Compare isolated old/new generated-runtime append workloads; validate identical replay output before recording timing results.
- [x] Obtain an independent read-only review and address concrete findings with tests (no remaining findings in this change).
- [x] Build and package a macOS candidate without installing or launching it against production state.
- [x] Record actual results and remaining platform/performance validation gaps. Do not claim the entire app's performance is fully optimized.

Direct verification commands:

```bash
node node_modules/typescript/bin/tsc --noEmit
node node_modules/@biomejs/biome/bin/biome check .
env ELECTRON_RUN_AS_NODE=1 node_modules/electron/dist/Electron.app/Contents/MacOS/Electron node_modules/electron-vite/bin/electron-vite.js build
env CSC_IDENTITY_AUTO_DISCOVERY=false node node_modules/electron-builder/cli.js --mac --x64 --dir --publish never -c.directories.output=.tmp/helper-replay-package.fJGfuI -c.npmRebuild=false -c.mac.identity=null -c.mac.notarize=false
```

## Isolated Append Benchmark

Environment: macOS x64, Electron 39.2.7, Node 22.21.1, exposed GC. Each sample runs in a separate process. Each helper starts with a full 4,194,304-code-unit agent replay and receives 1,024 chunks of 1,024 code units containing ASCII, ANSI, and Unicode (1,048,576 appended units). Three old/new pairs per helper alternate execution order. The baseline is `e9f561388ceb6f91ae10858798e3537bb27e5937`.

| Helper | Implementation | Median Append Time | Median Append CPU | Median Snapshot Read |
| --- | --- | --- | --- | --- |
| Local supervisor | Old string tail | 16,872.05 ms | 12,470.67 ms | 0.22 ms |
| Local supervisor | New chunk buffer | 49.41 ms | 55.65 ms | 17.10 ms |
| Remote helper | Old string tail | 27,449.14 ms | 12,458.97 ms | 0.04 ms |
| Remote helper | New chunk buffer | 52.90 ms | 62.65 ms | 18.54 ms |

Every sample checks complete string equality against the reference replay. All final replays contain 4,194,304 code units with SHA-256 `06b624aea233c8797f6ba2a5de94f68e76c69af588cf829220d0334cf484f4db`.

The tradeoff is explicit: reading a snapshot now materializes the bounded replay once, rather than paying reconstruction costs on every append. These are synthetic helper workloads, not real Windows/SSH end-to-end measurements or evidence that macOS renderer long tasks are eliminated. Wall times vary under concurrent machine load; CPU times corroborate the mechanism. No overall app-speed or heap-improvement claim is made from this benchmark.

Local artifacts:

- `.tmp/diagnostics/helper-replay-20261013-before/`: read-only diagnostic capture.
- `.tmp/diagnostics/helper-replay-20261013-benchmark.ts`: isolated benchmark driver.
- `.tmp/diagnostics/helper-replay-20261013-benchmark-final.json`: final Electron/Node 22 samples.
- `.tmp/diagnostics/helper-replay-20261013-benchmark.json`: preliminary Node 25 samples, excluded from final comparisons because its TSX CLI wrapper did not expose GC.

The running application's `app.asar` hash remains `2b774a79fa237d95e1beefcaae0a60ff8c8ee98b333d4e5490f6d0f692262a74`. This turn does not install the candidate, restart a daemon, or force an existing persistent supervisor session onto new runtime code. Existing daemons retain their loaded implementation until a separately coordinated safe restart.

## Final Verification

- Focused helper tests: 59 passed.
- Session, terminal, remote, shared replay, and renderer terminal regression tests: 526 passed in 27 files.
- `tsc --noEmit`: passed.
- `biome check .`: passed, 1,520 files checked.
- Renderer theme audit: passed.
- Test-quality audit: strict checks passed; existing advisories about default E2E exclusion and source-introspection tests remain.
- `git diff --check`: passed.
- Independent read-only review: no remaining Critical, Important, or Minor findings in this helper-only change.
- Electron Vite production build: passed for main, preload, and renderer. Existing non-module bootstrap-script warnings remain.
- Electron Builder macOS x64 directory package: passed. Other-platform optional dependency warnings remain; signing and notarization were explicitly disabled for this local candidate.
- Candidate ASAR main/preload/renderer entry files exactly match the build output, and the shared buffer/lazy helper read paths are present.
- Candidate Electron/Node 22 successfully loads `node-pty`, `@parcel/watcher`, and `sqlite3` without starting the GUI or touching production sessions.

Candidate: `.tmp/helper-replay-package.fJGfuI/mac/Infilux.app`.

Candidate `app.asar` SHA-256: `130e218e7289dfbcc0a7476239c9cf1f785df04af2bc3f60767933e82d893933`.

The installed application remains unchanged and running (main PID 82779). No source changes were committed or pushed by this turn. The complete repository test suite and packaged GUI E2E were not run as part of this narrowly scoped change.

## Remaining Acceptance Gates

- Real Windows supervisor and real SSH helper high-output runs.
- The broader five-scenario OpenSpec performance baseline, including multiple visible and hidden terminals.
- Coordinated deployment and GUI/input validation of the candidate, with explicit permission to restart the application and any persistent daemon.
- Lossless streaming and attachment acceptance under real load: the existing replay-length handoff protocol is unchanged, including its pre-existing rolling-buffer boundary risk during attach activation.

These gates prevent an overall production-performance acceptance claim. They do not invalidate the verified helper append optimization.
