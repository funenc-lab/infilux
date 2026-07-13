# Application Performance Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `test-driven-development` for every behavior change and preserve all pre-existing user-owned worktree changes.

**Goal:** Eliminate the measured 10-second CPU and memory spikes, remove main-process blocking I/O, reduce renderer startup and tree-render costs, and restore a bounded production build.

**Architecture:** Application-wide background work is owned by singleton coordinators instead of keep-mounted panels. Expensive Git and session operations are deduplicated and separated from persistence, while renderer-heavy features load behind explicit dynamic boundaries. Main-process filesystem and child-process work uses asynchronous, cancellable adapters with bounded concurrency.

**Tech Stack:** Electron 39, React 19, TypeScript 5.9, Zustand, Vitest, electron-vite, Node.js filesystem and child-process APIs.

## Global Constraints

- Preserve all existing uncommitted user changes, especially session-title work under `src/renderer/components/chat/`, `src/renderer/stores/agentSessions.ts`, and `src/shared/utils/persistentAgentSession.ts`.
- All source code, test code, XML, and code comments must be English-only.
- Preserve local and remote repository behavior and typed IPC contracts.
- Do not add `any`, `@ts-ignore`, hidden global state, or new runtime dependencies.
- Every production behavior change requires a focused failing test before implementation.
- Do not publish partial Git statistics or replace a last-known valid value with zero after an error.
- Do not commit, reset, or discard user-owned worktree changes.

---

### Task 1: Make agent-session persistence application-scoped and probe-free

**Files:**
- Create: `src/renderer/App/hooks/agentSessionPersistenceCoordinator.ts`
- Create: `src/renderer/App/hooks/useAgentSessionPersistence.ts`
- Create: `src/renderer/App/hooks/__tests__/useAgentSessionPersistence.test.ts`
- Create: `src/renderer/components/chat/agentSessionPersistenceRecord.ts`
- Create: `src/renderer/components/chat/__tests__/agentSessionPersistenceRecord.test.ts`
- Modify: `src/renderer/App.tsx`
- Modify carefully: `src/renderer/components/chat/AgentPanel.tsx`
- Modify: `src/main/services/session/PersistentAgentSessionRepository.ts`
- Modify: `src/main/services/session/PersistentAgentSessionService.ts`
- Modify: `src/main/services/session/__tests__/PersistentAgentSessionRepository.test.ts`
- Modify: `src/main/services/session/__tests__/PersistentAgentSessionService.test.ts`
- Modify: `src/main/ipc/__tests__/agentSession.test.ts`

**Interfaces:**
- `createAgentSessionPersistenceCoordinator(dependencies): AgentSessionPersistenceCoordinator`
- `buildPersistentAgentSessionRecord(session, environment): PersistentAgentSessionRecord`
- `PersistentAgentSessionRepository.getSession(uiSessionId): Promise<PersistentAgentSessionRecord | undefined>`
- `PersistentAgentSessionService.upsertSession(record): Promise<void>`

- [ ] Write tests proving six mounted panel-equivalent notifications create one persistence write and only the changed session is rebuilt.
- [ ] Run the focused renderer tests and confirm the duplicate-write assertions fail.
- [ ] Write service tests proving `upsertSession` performs zero host probes, preserves an authoritative missing/dead state for an unchanged host identity, and `reconcileSession(id)` probes only that record.
- [ ] Run the focused main tests and confirm the probe and return-value assertions fail.
- [ ] Implement a singleton coordinator mounted once from `App.tsx`, serialize mutations, and remove panel-owned global persistence effects without changing replay capture behavior.
- [ ] Move record construction to a pure module while preserving the current canonical title and metadata behavior from the dirty worktree.
- [ ] Add repository single-record lookup, remove implicit reconciliation from `upsertSession`, and return no record collection from mark persistence.
- [ ] Re-run focused renderer, service, repository, IPC, and preload tests.

### Task 2: Bound and deduplicate Git diff-stat collection

**Files:**
- Create: `src/renderer/lib/worktreeDiffStatsSchedule.ts`
- Create: `src/renderer/lib/__tests__/worktreeDiffStatsSchedule.test.ts`
- Create: `src/renderer/hooks/useWorktreeDiffStatsScheduler.ts`
- Create: `src/renderer/hooks/__tests__/useWorktreeDiffStatsScheduler.test.ts`
- Modify: `src/renderer/stores/worktreeActivity.ts`
- Modify: `src/renderer/stores/__tests__/worktreeActivity.test.ts`
- Modify: `src/renderer/components/layout/TreeSidebar.tsx`
- Modify: `src/renderer/components/layout/WorktreePanel.tsx`
- Modify: `src/renderer/components/layout/__tests__/sidebarDiffPollingPolicy.test.ts`
- Modify: `src/main/services/git/GitService.ts`
- Modify: `src/main/services/git/__tests__/GitService.test.ts`
- Modify: `src/main/services/remote/RemoteHelperSource.ts`
- Modify: `src/main/services/remote/__tests__/RemoteHelperSource.test.ts`

**Interfaces:**
- `deriveDiffStatsScope(input): string[]`
- `createDiffStatsSchedule(options): DiffStatsSchedule`
- `invalidateDiffStats(path): void`
- `GitService.getDiffStats(): Promise<DiffStats>` with incremental untracked-file caching.

- [ ] Write pure scheduler tests for one global owner, a maximum of three starts per 10 seconds, in-flight deduplication, selected/live/visible priority, fairness, and hidden-scope exclusion.
- [ ] Run scheduler tests and confirm the old panel-owned polling cannot satisfy them.
- [ ] Write store tests proving transient failures retain the last complete value and cleared paths reject late writes.
- [ ] Write Git service tests proving unchanged untracked files are not reread, changed files alone are reread, binary and line-count semantics remain correct, and repository escapes are rejected.
- [ ] Implement the single scheduler and remove both component-local intervals.
- [ ] Limit scope to selected, live, and actually visible worktrees; retain low-frequency fallback refresh without scanning every registered repository.
- [ ] Add per-file fingerprint caching and chunked local reads; implement equivalent non-blocking remote-helper behavior.
- [ ] Re-run focused renderer, local Git, remote helper, and IPC routing tests.

### Task 3: Remove main-process blocking work and repair background lifecycle

**Files:**
- Create: `src/main/services/files/LocalMediaProtocol.ts`
- Create: `src/main/services/files/__tests__/LocalMediaProtocol.test.ts`
- Modify: `src/main/index.ts`
- Modify: `src/main/__tests__/index.test.ts`
- Modify: `src/main/services/ai/commit-message.ts`
- Create: `src/main/services/ai/__tests__/commit-message.test.ts`
- Modify: `src/main/services/git/GitAutoFetchService.ts`
- Modify: `src/main/services/git/__tests__/GitAutoFetchService.test.ts`
- Modify: `src/main/services/settings/legacyImport.ts`
- Modify: `src/main/services/settings/__tests__/legacyImport.test.ts`

**Interfaces:**
- `createLocalMediaProtocolHandler(dependencies): ProtocolHandler`
- `GitAutoFetchService.attachWindow(window): void`
- `GitAutoFetchService.detachWindow(window?): void`
- `readElectronLocalStorageSnapshotFromLevelDbDirsAsync(paths, options): Promise<Record<string, string> | null>`

- [ ] Write media tests for asynchronous stat/read, full-video streaming, range streaming, cancellation, and existing URL/extension security rules.
- [ ] Write commit-message tests proving all three Git subprocesses start before any completes and no shell command string is used.
- [ ] Write auto-fetch fake-timer tests for destroyed-window detach, zero remaining timers, replacement-window reattach, and no notification to the old window.
- [ ] Write LevelDB tests proving a fresh shared snapshot performs zero `.ldb` content reads and required recovery uses asynchronous bounded reads.
- [ ] Implement the extracted asynchronous protocol handler and retain existing response headers and status semantics.
- [ ] Replace `execSync` with the existing `spawnGit` adapter and once-only timeout/error settlement.
- [ ] Replace one-shot auto-fetch initialization with attach/detach lifecycle methods wired to window events.
- [ ] Add a metadata fast path before LevelDB content scanning and an async startup reader without changing recovery ordering.
- [ ] Re-run all focused main-process tests.

### Task 4: Make source-control and file-tree expansion proportional to visible rows

**Files:**
- Modify: `src/renderer/stores/sourceControl.ts`
- Create: `src/renderer/stores/__tests__/sourceControlExpansion.test.ts`
- Modify: `src/renderer/components/source-control/ChangesTree.tsx`
- Create: `src/renderer/components/source-control/__tests__/ChangesTree.test.ts`
- Modify: `src/renderer/components/files/FileTree.tsx`
- Create: `src/renderer/components/files/__tests__/FileTreeExpansion.test.ts`

**Interfaces:**
- `setFoldersExpanded(paths: Iterable<string>, expanded: boolean): void`

- [ ] Write tests proving file leaves do not subscribe to expansion state, unrelated folders do not rerender, collapsed descendants are absent, and expand-all emits one store update.
- [ ] Run tests and confirm current recursive subscriptions and repeated mutations fail.
- [ ] Split folder and file nodes, use narrow selectors, atomically update expansion state, and conditionally mount descendants.
- [ ] Write file-tree tests proving collapsed descendants are unmounted and `gridTemplateRows` layout animation is absent while selection reveal remains correct.
- [ ] Remove the layout-property animation and retain transform/opacity-only affordances.
- [ ] Re-run source-control and file-tree focused tests.

### Task 5: Restore directories concurrently and virtualize large file trees

**Files:**
- Create: `src/renderer/hooks/fileTreeRestore.ts`
- Create: `src/renderer/hooks/__tests__/fileTreeRestore.test.ts`
- Modify: `src/renderer/hooks/useFileTree.ts`
- Create: `src/renderer/components/files/fileTreeVisibleRows.ts`
- Create: `src/renderer/components/files/__tests__/fileTreeVisibleRows.test.ts`
- Modify: `src/renderer/components/files/FileTree.tsx`

**Interfaces:**
- `restoreExpandedFileTree({ baseTree, paths, loadChildren, concurrency, signal }): Promise<FileTreeNode[]>`
- `flattenVisibleFileTree(input): VisibleFileTreeRow[]`

- [ ] Write controlled-promise tests proving directory restoration starts concurrently, never exceeds six requests, merges shallow-first deterministically, tolerates individual failures, and does not commit after cancellation.
- [ ] Implement concurrent fetch plus deterministic merge with a single final tree update.
- [ ] Write visible-row tests covering compact folders, expanded state, depth, selection, rename pins, and 10,000-row output.
- [ ] Introduce fixed-row windowing with overscan 12 and pinned editing/drag rows, using existing scroll containers and no new dependency.
- [ ] Add behavior tests for reveal, rename, context menu, compact folders, and drag auto-expand across the virtual boundary.
- [ ] Re-run file-tree hook, policy, and integration tests.

### Task 6: Defer settings, previews, Mermaid, and Monaco runtime

**Files:**
- Create: `src/renderer/components/layout/DeferredDraggableSettingsWindow.tsx`
- Create: `src/renderer/components/layout/__tests__/deferredDraggableSettingsWindow.test.ts`
- Modify: `src/renderer/App/AppOverlays.tsx`
- Create: `src/renderer/components/files/DeferredMarkdownPreview.tsx`
- Create: `src/renderer/components/files/DeferredPdfPreview.tsx`
- Create: `src/renderer/components/files/DeferredMermaidRenderer.tsx`
- Create: `src/renderer/components/files/__tests__/deferredPreviewLoading.test.ts`
- Modify: `src/renderer/components/files/EditorArea.tsx`
- Modify: `src/renderer/components/files/MarkdownPreview.tsx`
- Modify: `src/renderer/components/files/monacoSetup.ts`
- Modify: `src/renderer/components/files/monacoTheme.ts`

- [ ] Write loader tests proving closed settings, image/PDF files, ordinary text, and Markdown without Mermaid do not request unrelated heavy modules.
- [ ] Run the loader tests and confirm current static imports fail the boundaries.
- [ ] Implement stable deferred wrappers with loading, retry, and close-animation preservation.
- [ ] Dynamically load Monaco only for editor modes that require it and inject the loaded API into theme/model helpers.
- [ ] Dynamically load Mermaid only when a Mermaid fenced block renders.
- [ ] Re-run editor, preview, settings, Monaco model retention, and overlay tests.

### Task 7: Establish a bounded, analyzable renderer build

**Files:**
- Move: `src/renderer/bootstrap-head.js` to `src/renderer/public/bootstrap-head.js`
- Move: `src/renderer/bootstrap-body.js` to `src/renderer/public/bootstrap-body.js`
- Modify: `src/renderer/index.html`
- Modify: `electron.vite.config.ts`
- Modify: `src/renderer/__tests__/indexHtmlBootstrap.test.ts`
- Modify: `src/renderer/__tests__/bootstrapScripts.test.ts`
- Create: `scripts/analyze-renderer-build.ts`
- Create: `scripts/__tests__/rendererBuildAnalysis.test.ts`
- Modify: `package.json`

- [ ] Write tests proving bootstrap scripts are copied public assets, retain synchronous head/body ordering, and are present in build output.
- [ ] Write analyzer tests for missing bootstrap assets, entry-closure heavy-module leaks, largest assets, manifest traversal, and a 240-second build timeout report.
- [ ] Configure an explicit renderer public directory and build manifest; update classic script URLs without converting them to modules.
- [ ] Add `build:analyze` and generate a machine-readable build report with phase time and chunk closure data.
- [ ] Run three clean-output builds; require each to finish within 240 seconds and contain no unresolved classic-script warnings.

### Task 8: Full regression and runtime acceptance

**Files:**
- Update only tests or instrumentation needed to make the measurements deterministic.

- [ ] Run all focused test files from Tasks 1-7.
- [ ] Run `pnpm typecheck` and resolve only regressions introduced by this plan.
- [ ] Run `pnpm lint` and resolve only regressions introduced by this plan.
- [ ] Run `pnpm test`; distinguish the four pre-existing dirty-worktree failures captured before implementation from new failures.
- [ ] Run `pnpm build` and `pnpm build:analyze` with fresh output.
- [ ] Launch an isolated production preview and sample CPU, RSS, renderer heap, `tmux has-session`, and Git child-process counts for at least 60 seconds.
- [ ] Accept only if one replay snapshot commit produces one persistence write, mark persistence produces zero tmux probes, hidden worktrees produce zero diff-stat polling, main-process synchronous file reads are absent from protocol and commit paths, and no 10-second CPU/RSS sawtooth remains in the isolated preview.
