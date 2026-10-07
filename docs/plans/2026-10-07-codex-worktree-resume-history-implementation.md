# Codex Worktree Resume History Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make externally created Codex conversations appear in the correct Infilux worktree on the next launch, and make successive Infilux Codex sessions for that worktree use one consistent resume index.

**Architecture:** Preserve each UI session's isolated `CODEX_HOME` and the existing worktree-scoped JSONL directory. Import only *new* matching external transcripts independently of the one-time legacy marker before starting Codex; never replace existing JSONL, even when the external source later grows. Give the worktree one persistent Codex SQLite directory using `CODEX_SQLITE_HOME` and a CLI `-c sqlite_home=...` override. Use a separate Infilux-owned SQLite transaction to serialize importers; never edit the external Codex home or Codex's private SQLite database directly.

**Tech Stack:** Electron main process, TypeScript, Node filesystem, Vitest, real `codex` CLI, optional Electron E2E.

---

Implement the approved [design](2026-10-07-codex-worktree-resume-history-design.md) in the dedicated worktree `/Users/aiassist/Development/Projects/infilux/.worktrees/codex-worktree-resume-history` on branch `fix/codex-worktree-resume-history`. Follow @systematic-debugging, @test-driven-development, and @verification-before-completion. Check `git status --short --branch` before edits; preserve unrelated work. Read the nearest `AGENTS.md` for every touched directory. The `.codegraph/` directory here has no usable index; use `rg` for source navigation until the user creates an index.

Baseline already verified here: `pnpm exec vitest run src/main/services/agent/__tests__/CodexWorkspaceSessionHistory.test.ts src/main/services/agent/__tests__/CodexRuntimeHomeService.test.ts src/main/ipc/__tests__/session.test.ts` → 33 passing; `pnpm typecheck` → passing. Dependencies were installed with `pnpm install --frozen-lockfile --ignore-scripts` because the current macOS Command Line Tools compiler cannot locate the installed SDK's `unordered_set` header during `@parcel/watcher` postinstall. Resolve that local toolchain issue before requiring native Electron E2E; do not report E2E as passing without running it.

Official Codex contract: [environment variables](https://developers.openai.com/codex/config-file/environment-variables) document `CODEX_SQLITE_HOME` and configuration precedence; [configuration precedence](https://developers.openai.com/codex/config-basic) documents the CLI override's priority over file configuration. Do not assume `CODEX_SQLITE_HOME` alone wins against an existing `sqlite_home` in any of Codex's configuration layers.

### Task 1: Prove a real Codex CLI can discover an imported transcript

**Files:**
- Create: `src/main/services/agent/__tests__/CodexNativeResume.integration.test.ts`
- Inspect: `src/main/services/agent/CodexWorkspaceSessionHistory.ts`

**Step 1: Write a gated, isolated integration test.** Create separate temporary source and target `CODEX_HOME` directories with **different** source and target SQLite directories; never share their indexes for the import check, or the test will produce a false positive. Use `spawn('codex', ['app-server', '--listen', 'stdio://', '-c', 'sqlite_home="<absolute path>"'], { env: { PATH: process.env.PATH, HOME: tempHome, CODEX_HOME: testHome, CODEX_SQLITE_HOME: sqliteHome } })`; whitelist required OS variables on Windows, but never inherit credentials or the developer's real Codex history. Send newline-delimited JSON requests, initialize with `clientInfo: { name: 'infilux_test', title: 'Infilux Test', version: '1' }`, wait for the matching response, then send `initialized`. Check the installed CLI's `codex app-server generate-json-schema` output or official app-server protocol before fixing the exact `thread/start`/`thread/list` parameters. Create a thread without starting a model turn, stop the source server, place its complete JSONL in the target home's `sessions`, then ask a fresh server using a **new, empty target index** for that worktree's `thread/list`. Include a sibling-worktree control, a hard timeout, `finally` process cleanup, and skip with an explicit reason if `codex` is absent. Do not print transcript contents.

**Step 2: Run only this test.** Run `pnpm exec vitest run src/main/services/agent/__tests__/CodexNativeResume.integration.test.ts`. This is a feasibility gate: if an imported JSONL is not indexed by a supported Codex startup/list path, stop implementation and report the observed CLI response; do not insert rows into private SQLite tables.

**Step 3: Make the fixture reproducible.** Adjust only the isolated fixture/protocol if Codex requires more metadata for a valid resumable interactive thread. Check whether `thread/list` applies the same cwd and interactive-origin filters as `codex resume`; where they differ, add a bounded PTY-based `codex resume` picker smoke test in Task 6. Do not involve any network-backed model request.

**Step 4: Re-run the isolated test.** Expect the imported matching thread to be listed, the sibling thread not to be listed, and the process to exit cleanly after the test.

**Step 5: Commit.** `git add src/main/services/agent/__tests__/CodexNativeResume.integration.test.ts && git commit -m "test: establish native Codex resume discovery fixture"`.

### Task 2: Give each worktree a stable SQLite location

**Files:**
- Modify: `src/main/services/agent/CodexWorkspaceSessionHistory.ts:176`
- Modify: `src/main/services/agent/CodexRuntimeHomeService.ts:32,273`
- Test: `src/main/services/agent/__tests__/CodexWorkspaceSessionHistory.test.ts`
- Test: `src/main/services/agent/__tests__/CodexRuntimeHomeService.test.ts`

**Step 1: Add failing tests.** Assert two UI runtime keys for one worktree return different `homePath` values but the same `sqliteHomePath`; a sibling worktree gets a different SQLite path. After `releaseRuntimeHome(first.homePath)` and `pruneOrphanedRuntimeHomes(...)`, the stable SQLite directory must remain. Include a path with spaces and a remote virtual worktree identity to guard existing path hashing.

**Step 2: Run the focused suites; expect failure.** `pnpm exec vitest run src/main/services/agent/__tests__/CodexWorkspaceSessionHistory.test.ts src/main/services/agent/__tests__/CodexRuntimeHomeService.test.ts` should fail on the new result/path assertions.

**Step 3: Implement the path and result.** Add `export function resolveCodexWorkspaceSqliteHomePath(scope: CodexWorkspaceSessionHistoryScope): string { return path.join(path.dirname(resolveCodexWorkspaceSessionHistoryPath(scope)), 'sqlite'); }`. Change `CodexRuntimeHomeResult` to `AgentRuntimeHomeResult & { sqliteHomePath: string }`; in `prepareRuntimeHome`, use `const sqliteHomePath = path.join(path.dirname(options.sessionHistoryPath), 'sqlite')` so injected test paths and canonical worktree paths have the same sibling-directory invariant, then `mkdirSync(sqliteHomePath, { recursive: true })` and return `{ ...runtimeHome, sqliteHomePath }`. The SQLite home must never be a child of the short-lived runtime home.

**Step 4: Re-run the two suites; expect pass.** `pnpm exec vitest run src/main/services/agent/__tests__/CodexWorkspaceSessionHistory.test.ts src/main/services/agent/__tests__/CodexRuntimeHomeService.test.ts`.

**Step 5: Commit.** `git add src/main/services/agent/CodexWorkspaceSessionHistory.ts src/main/services/agent/CodexRuntimeHomeService.ts src/main/services/agent/__tests__/CodexWorkspaceSessionHistory.test.ts src/main/services/agent/__tests__/CodexRuntimeHomeService.test.ts && git commit -m "fix: retain a worktree-scoped Codex SQLite home"`.

### Task 3: Import only new, valid external transcripts before launch

**Files:**
- Create: `src/main/services/agent/CodexExternalSessionImport.ts`
- Create: `src/main/services/agent/__tests__/CodexExternalSessionImport.test.ts`
- Modify: `src/main/services/agent/CodexWorkspaceSessionHistory.ts:62-161` (reuse scanner and worktree normalization, without changing legacy marker semantics)

**Step 1: Write a failing import matrix.** Tests create temporary external/worktree homes and simulate an already-written `.legacy-session-history-migrated-v2`. Cover: new matching transcript appears, sibling/unclassifiable/incomplete JSONL does not appear, same path imported twice only once, duplicate thread ID under a different filename does not appear, filename collision with a different ID never overwrites, symlinked JSONL/directory is not traversed, and a source mutation during copying leaves no visible partial target and can retry. Use UUID-like IDs and JSONL records with terminal `\n`; compare file bytes, not counts alone.

**Step 2: Run the new suite; expect failure.** `pnpm exec vitest run src/main/services/agent/__tests__/CodexExternalSessionImport.test.ts`.

**Step 3: Implement the minimal import.** Export a function with a narrow contract:

```ts
interface ImportCodexExternalSessionsOptions {
  sessionHistoryPath: string;
  sourceSessionsPath: string;
  worktreePath: string;
}
interface ImportCodexExternalSessionsResult {
  imported: number;
  refreshed: number;
  retryableFailures: number;
}
export async function importCodexExternalSessions(
  options: ImportCodexExternalSessionsOptions
): Promise<ImportCodexExternalSessionsResult>;
```

Resolve/canonicalize roots and return immediately if source equals or sits inside the target worktree history. Traverse regular files only; reuse the 64-KiB `session_meta` scanner and normalized exact worktree comparison from `CodexWorkspaceSessionHistory.ts`, extending its parsed result with a validated thread ID. Build target existing-ID ownership once per pass. Require the source to be a complete newline-terminated JSONL, parse its last nonblank record, and compare source `stat` (`dev`, `ino`, `size`, `mtimeMs`) before/after reading. Write a unique `wx` temp file inside the target directory and publish a *new* target with an exclusive hard link followed by temp unlink; a losing concurrent importer must not overwrite it. Treat incomplete/unstable/missing candidates as retryable, never mark the whole worktree imported, and return bounded error counts without logging JSONL contents. Keep the legacy `migrateCodexWorkspaceSessionHistory` marker and its tests unchanged.

**Step 4: Re-run both new and legacy suites; expect pass.** `pnpm exec vitest run src/main/services/agent/__tests__/CodexExternalSessionImport.test.ts src/main/services/agent/__tests__/CodexWorkspaceSessionHistory.test.ts`.

**Step 5: Commit.** `git add src/main/services/agent/CodexExternalSessionImport.ts src/main/services/agent/CodexWorkspaceSessionHistory.ts src/main/services/agent/__tests__/CodexExternalSessionImport.test.ts && git commit -m "fix: import matching external Codex history incrementally"`.

### Task 4: Remove unsafe refresh and preserve existing targets

**Files:**
- Modify: `src/main/services/agent/CodexExternalSessionImport.ts`
- Modify: `src/main/services/agent/__tests__/CodexExternalSessionImport.test.ts`

**Step 1: Write failing safety tests.** Import a transcript, then append a complete JSONL record to the external source; expect no refresh and identical target bytes/inode. Hold an open append file descriptor to the target across a subsequent import attempt, append through that descriptor, and assert the appended record remains visible at the target path. Confirm an edited target and a pre-existing target without provenance are never overwritten. Keep the simultaneous-new-import, source-mutation, and incomplete-source tests from Task 3; only *new* source sessions are imported on the next pass.

**Step 2: Run the new suite; expect failure.** `pnpm exec vitest run src/main/services/agent/__tests__/CodexExternalSessionImport.test.ts`.

**Step 3: Remove refresh and sidecars.** Replace the unshipped Task 4 implementation of per-target provenance and atomic target replacement with Task 3's append-free, exclusive hard-link publication. Only import thread IDs absent from the target inventory under the Infilux-owned SQLite transaction spanning scan through publication; a known ID or occupied filename is never overwritten. Keep bounded streaming and strict UTF-8/final-record validation, symlink rejection, source `stat` stability, fail-closed target scan, and the legacy migration marker. Keep the result's `refreshed` field at zero for its existing narrow contract. Delete obsolete sidecar-refresh tests, retaining new tests for source growth and live file-descriptor safety. Do not write the external home or Codex's SQLite index.

**Step 4: Re-run the suite; expect pass.** `pnpm exec vitest run src/main/services/agent/__tests__/CodexExternalSessionImport.test.ts`.

**Step 5: Commit.** `git add src/main/services/agent/CodexExternalSessionImport.ts src/main/services/agent/__tests__/CodexExternalSessionImport.test.ts && git commit -m "fix: keep imported Codex transcripts immutable"`.

### Task 5: Await import and enforce the SQLite override for both launch paths

**Files:**
- Modify: `src/main/services/agent/CodexRuntimeHomeService.ts:249-285`
- Modify: `src/main/ipc/session.ts:123-195`
- Modify: `src/main/services/agent/CodexCapabilityProviderAdapter.ts:543-577`
- Create: `src/main/services/agent/CodexSqliteLaunchOptions.ts`
- Modify: `src/renderer/components/chat/agentLaunchPlan.ts:460-470`
- Test: `src/main/services/agent/__tests__/CodexRuntimeHomeService.test.ts`
- Test: `src/main/services/agent/__tests__/CodexCapabilityProviderAdapter.test.ts`
- Test: `src/main/ipc/__tests__/session.test.ts`
- Create: `src/main/services/agent/__tests__/CodexSqliteLaunchOptions.test.ts`
- Test: `src/renderer/components/chat/__tests__/agentLaunchPlan.test.ts`

**Step 1: Write failing launch and ordering tests.** For plain and capability-based Codex launches, check `CODEX_HOME` remains per-UI-session, `CODEX_SQLITE_HOME` is the same for same-worktree launches, and `-c sqlite_home="<path>"` is injected into direct `shell: '/path/codex'`/`args` and into recognized `initialCommand`/fallback shell-command strings. Assert a pre-existing source or project `sqlite_home` cannot redirect the value; a different worktree gets a different path; non-Codex sessions and explicit *user-owned* `CODEX_HOME` remain unchanged. Assert that a post-marker external JSONL is already present when `prepareRuntimeHome` resolves (not only after the legacy coordinator flushes). Include a path with quotes/spaces and the no-capability-assignments case. Add a renderer launch-plan assertion that a **local** persistent tmux Codex session forwards `CODEX_SQLITE_HOME` via `tmux new-session -e`, while remote and non-Codex launches do not acquire this local managed value.

**Step 2: Run the focused suites; expect failure.** `pnpm exec vitest run src/main/services/agent/__tests__/CodexSqliteLaunchOptions.test.ts src/main/services/agent/__tests__/CodexRuntimeHomeService.test.ts src/main/services/agent/__tests__/CodexCapabilityProviderAdapter.test.ts src/main/ipc/__tests__/session.test.ts src/renderer/components/chat/__tests__/agentLaunchPlan.test.ts`.

**Step 3: Wire the import.** In `CodexRuntimeHomeService.prepareRuntimeHome`, keep the legacy migration scheduled as before but `await importCodexExternalSessions({ sessionHistoryPath: options.sessionHistoryPath, sourceSessionsPath: path.join(runtimeHome.sourceHomePath, 'sessions'), worktreePath: options.sessionHistoryScope.worktreePath ?? '' })` before return; catch narrowly, log only path-free summary/count and proceed with launch so transient IO errors retry on the next launch. Avoid running the independent importer on a worktree-scoped history symlink pointing at itself. Give a competing importer a bounded wait (for example, `busyTimeout` of a few seconds) before deferring; after timeout, emit an explicit warning that the initial resume list may be incomplete and retry next launch. A failed or timed-out import must never damage existing history or permanently block Codex.

**Step 4: Wire both launch shapes and persistent hosts.** Set `CODEX_SQLITE_HOME: runtimeHome.sqliteHomePath` in both `ensureCodexRuntimeHome` and `CodexCapabilityProviderAdapter.prepareLaunch` for managed local native Codex only. Implement `applyCodexSqliteLaunchOptions(options, sqliteHomePath)` that produces `-c` and `sqlite_home=${JSON.stringify(sqliteHomePath)}` as *separate argv elements* for direct Codex executable launches. For renderer-generated shell/tmux launchers, carry a narrow typed description of the original executable, arguments, primary command, and fallback across IPC; verify the launch still matches that description after capability projection and rebuild the command with CLI overrides at the executable position. Do not infer executable boundaries with a regex over serialized shell text: prompt text and quoted executable paths may contain `codex`, spaces, and apostrophes. Apply the override **once** in `prepareAgentSessionOptions` after capability overrides and managed-home preparation, so capability projection with zero assignments still receives it. In `agentLaunchPlan.ts`, append `CODEX_SQLITE_HOME` to `sessionEnvironmentVariableNames` for **local native Codex** tmux launches only; preserve existing remote behavior. Validate that workspace parent, existing `sessions`, and SQLite directories cannot redirect via sibling-worktree symlinks *before* constructing the managed runtime. Do not interpolate an unquoted path into a shell command. For Hapi/Happy built-in wrappers whose native Codex CLI invocation cannot be guaranteed, preserve the launch and show a persistent warning for the active session that resume index isolation is unavailable. If an unrecognized custom launcher cannot safely enforce `sqlite_home` while sharing a managed home, fail explicitly. Add tests for duplicate injection, unsupported launch shapes, native quoted paths and prompts, tmux/fallback, local-vs-remote paths, and a workspace-parent symlink.

**Step 5: Re-run all five focused suites; expect pass.** Run the command from Step 2, then `pnpm typecheck`. Commit with `git add src/main/services/agent/CodexRuntimeHomeService.ts src/main/services/agent/CodexSqliteLaunchOptions.ts src/main/services/agent/CodexCapabilityProviderAdapter.ts src/main/ipc/session.ts src/renderer/components/chat/agentLaunchPlan.ts src/main/services/agent/__tests__/CodexRuntimeHomeService.test.ts src/main/services/agent/__tests__/CodexCapabilityProviderAdapter.test.ts src/main/services/agent/__tests__/CodexSqliteLaunchOptions.test.ts src/main/ipc/__tests__/session.test.ts src/renderer/components/chat/__tests__/agentLaunchPlan.test.ts && git commit -m "fix: scope Codex resume indexing and synchronize before launch"`.

### Task 6: Verify the real picker and app lifecycle, then finish

**Files:**
- Modify: `e2e/helpers/codexWorktreeHistoryScenario.ts`
- Modify: `e2e/codex-worktree-history.test.ts`
- Modify: `src/main/services/agent/__tests__/CodexNativeResume.integration.test.ts`
- Inspect: `src/main/services/session/SessionManager.ts:2332-2345`
- Inspect: `src/main/services/session/PersistentAgentSessionRepository.ts:648-670`

**Step 1: Extend the existing fake-Codex E2E assertion.** Add a second matching external JSONL only after the old migration marker exists; restart/launch, assert it appears on the *first* `/resume` of that launch while a sibling-worktree session remains absent. Log the fake CLI's `CODEX_SQLITE_HOME` and assert two launches in one worktree share it; kill an individual UI session and assert its `CODEX_HOME` is deleted but the worktree SQLite directory persists.

**Step 2: Run isolated real-CLI smoke and read its result.** Reuse the Task 1 fixture with the exact managed launch options (`CODEX_HOME`, `CODEX_SQLITE_HOME`, `-c sqlite_home=...`), and verify a real `codex resume` picker via a disposable PTY if `thread/list` does not faithfully match picker behavior. Assert cwd filtering and imported transcript visibility; use only temporary homes, and do not trigger a model response. If the real picker does not list the import, stop and report this as a failed acceptance gate rather than changing private Codex SQLite state.

**Step 3: Restore native build capability or document the environment blocker.** First validate the compiler can include `<unordered_set>` with the SDK header path configured. Rebuild/install native dependencies without altering the user's system toolchain, then run `pnpm test:e2e -- e2e/codex-worktree-history.test.ts` (or `pnpm build && pnpm exec vitest run --config vitest.e2e.config.ts e2e/codex-worktree-history.test.ts` if the script's argument forwarding differs). If native compilation cannot be fixed within the workspace, run all non-native checks and clearly mark E2E unverified.

**Step 4: Run final quality gates with fresh output.** `pnpm typecheck`; `pnpm lint`; `pnpm test`; `pnpm exec vitest run src/main/services/agent/__tests__/CodexNativeResume.integration.test.ts`; E2E only if Step 3 succeeded. Check `git diff --check`, `git status --short --branch`, and verify no test fixtures or private transcript data entered Git.

**Step 5: Commit only the final test changes.** `git add e2e/helpers/codexWorktreeHistoryScenario.ts e2e/codex-worktree-history.test.ts src/main/services/agent/__tests__/CodexNativeResume.integration.test.ts && git commit -m "test: cover Codex resume consistency across restarts"`. Apply @requesting-code-review and @finishing-a-development-branch when their triggers are met, after reporting the exact verification status.
