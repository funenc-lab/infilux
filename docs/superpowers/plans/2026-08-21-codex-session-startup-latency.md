# Codex Session Startup Latency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Start a new Codex session without waiting for legacy history migration, while preserving safe, per-worktree history import.

**Architecture:** `CodexRuntimeHomeService` will establish the isolated runtime home synchronously and schedule legacy history migration after the session-launch path has yielded. A dedicated coordinator will serialize migration per history directory, keep failures observable, and prevent duplicate queued work. The low-level history reader will parse a bounded full JSONL metadata line instead of truncating it at 16 KiB, and canonical source-path deduplication will avoid repeatedly traversing symlinked workspace histories.

**Tech Stack:** Electron main process, TypeScript, Node.js filesystem APIs, Vitest.

## Global Constraints

- New Codex sessions must not await legacy-history discovery, scanning, or file copying.
- Keep worktree history isolation and existing runtime-home symlink semantics intact.
- Never overwrite existing session history files or remove user data.
- Bound metadata-line reads to 64 KiB and report unsupported metadata through the migration result.
- Keep all production source and code comments in English.

---

### Task 1: Lock down bounded metadata parsing and migration completion

**Files:**
- Modify: `src/main/services/agent/CodexWorkspaceSessionHistory.ts`
- Test: `src/main/services/agent/__tests__/CodexWorkspaceSessionHistory.test.ts`

**Interfaces:**
- Produces: `readCodexSessionWorktreePath(filePath): Promise<string | null>` and an extended `CodexWorkspaceSessionHistoryMigrationResult` that records unsupported files.
- Consumes: `extractCodexSessionMeta` from `codexSessionMetadata.ts` and Node asynchronous filesystem APIs.

- [ ] **Step 1: Write failing tests for a long metadata line and idempotent completion**

```ts
it('migrates a session whose session_meta line exceeds 16 KiB', async () => {
  await writeSessionFile({ sourceRoot, cwd: worktreePath, paddingBytes: 20 * 1024 });

  const result = await migrateCodexWorkspaceSessionHistory({
    sessionHistoryPath: targetRoot,
    sourceSessionsPaths: [sourceRoot],
    worktreePath,
  });

  expect(result.complete).toBe(true);
  expect(result.migratedFileCount).toBe(1);
  expect(await exists(markerPath)).toBe(true);
});
```

- [ ] **Step 2: Run the focused test and verify it fails because the current 16 KiB scan misses the metadata record**

Run: `pnpm vitest run src/main/services/agent/__tests__/CodexWorkspaceSessionHistory.test.ts`

Expected: FAIL because the long session metadata is not migrated and no marker is written.

- [ ] **Step 3: Implement a bounded JSONL header reader and canonical source deduplication**

```ts
const MAX_CODEX_SESSION_METADATA_LINE_BYTES = 64 * 1024;

const metadata = await readCodexSessionMetadataHeader(filePath);
if (!metadata?.cwd) {
  unsupportedFileCount += 1;
  continue;
}
```

- [ ] **Step 4: Run the focused test and verify it passes**

Run: `pnpm vitest run src/main/services/agent/__tests__/CodexWorkspaceSessionHistory.test.ts`

Expected: PASS with the long metadata file migrated exactly once and a completion marker written.

### Task 2: Schedule legacy migration outside the session creation critical path

**Files:**
- Create: `src/main/services/agent/CodexWorkspaceHistoryMigrationCoordinator.ts`
- Modify: `src/main/services/agent/CodexRuntimeHomeService.ts`
- Test: `src/main/services/agent/__tests__/CodexWorkspaceHistoryMigrationCoordinator.test.ts`
- Test: `src/main/services/agent/__tests__/CodexRuntimeHomeService.test.ts`

**Interfaces:**
- Produces: `CodexWorkspaceHistoryMigrationCoordinator.schedule(key, operation): void`.
- Consumes: a deferred task runner, an injected error reporter, and `migrateCodexWorkspaceSessionHistory`.
- Preserves: `CodexRuntimeHomeService.prepareRuntimeHome(runtimeKey, options): Promise<CodexRuntimeHomeResult>`.

- [ ] **Step 1: Write failing tests for deferred, deduplicated migration scheduling**

```ts
it('returns from prepareRuntimeHome before legacy migration begins', async () => {
  const { service, flushBackgroundTasks, migrate } = createRuntimeHomeHarness();

  await service.prepareRuntimeHome('session-a', options);

  expect(migrate).not.toHaveBeenCalled();
  await flushBackgroundTasks();
  expect(migrate).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run the focused tests and verify they fail because migration is currently awaited**

Run: `pnpm vitest run src/main/services/agent/__tests__/CodexWorkspaceHistoryMigrationCoordinator.test.ts src/main/services/agent/__tests__/CodexRuntimeHomeService.test.ts`

Expected: FAIL because `prepareRuntimeHome` blocks on migration and no coordinator exists.

- [ ] **Step 3: Implement the coordinator and make runtime-home preparation fast**

```ts
ensureWorkspaceCodexRuntimeSessions(options.sessionHistoryPath, runtimeHome.homePath);
this.migrationCoordinator.schedule(options.sessionHistoryPath, async () => {
  await migrateCodexWorkspaceSessionHistory({
    sessionHistoryPath: options.sessionHistoryPath,
    sourceSessionsPaths: this.collectLegacySessionSourcePaths(runtimeHome, options),
    worktreePath: options.sessionHistoryScope.worktreePath ?? '',
  });
});
```

- [ ] **Step 4: Run the focused tests and verify they pass**

Run: `pnpm vitest run src/main/services/agent/__tests__/CodexWorkspaceHistoryMigrationCoordinator.test.ts src/main/services/agent/__tests__/CodexRuntimeHomeService.test.ts`

Expected: PASS with one background operation per workspace and no migration work before the runtime home is returned.

### Task 3: Preserve legacy-source coverage without scanning active runtime symlinks

**Files:**
- Modify: `src/main/services/agent/CodexRuntimeHomeService.ts`
- Test: `src/main/services/agent/__tests__/CodexRuntimeHomeService.test.ts`

**Interfaces:**
- Produces: a source collector that includes the user Codex session root and real legacy runtime directories, while excluding `sessions` symlinks already pointing at isolated workspace histories.
- Consumes: `lstatSync`, `realpath`, and the migration coordinator introduced in Task 2.

- [ ] **Step 1: Write failing tests for legacy-directory inclusion and symlink exclusion**

```ts
expect(collectedSourcePaths).toContain(legacyRuntimeSessionsPath);
expect(collectedSourcePaths).not.toContain(activeWorkspaceSessionsSymlinkPath);
expect(new Set(collectedSourcePaths).size).toBe(collectedSourcePaths.length);
```

- [ ] **Step 2: Run the focused runtime-home test and verify it fails against the broad current collector**

Run: `pnpm vitest run src/main/services/agent/__tests__/CodexRuntimeHomeService.test.ts`

Expected: FAIL because all `sessions` entries are currently added without distinguishing symlinks from legacy directories.

- [ ] **Step 3: Implement legacy-only collection and realpath deduplication**

```ts
if (entry.name === 'sessions' && entry.isSymbolicLink()) {
  continue;
}
if (entry.name === 'sessions' || entry.name.startsWith('sessions.legacy-')) {
  sourcePaths.push(path.join(runtimeHomePath, entry.name));
}
```

- [ ] **Step 4: Run the focused runtime-home test and verify it passes**

Run: `pnpm vitest run src/main/services/agent/__tests__/CodexRuntimeHomeService.test.ts`

Expected: PASS with active workspace histories excluded and legacy source data retained.

### Task 4: Verify the session creation contract and regression coverage

**Files:**
- Test: `src/main/ipc/__tests__/session.test.ts`
- Test: `src/main/services/agent/__tests__/CodexWorkspaceSessionHistory.test.ts`

**Interfaces:**
- Verifies: `session:create` still prepares an isolated `CODEX_HOME`, returns a serializable session result, and no longer blocks on legacy migration.

- [ ] **Step 1: Add a regression assertion that Codex session creation can proceed while migration remains queued**

```ts
await expect(sessionCreateHandler(event, codexOptions)).resolves.toEqual(expectedSessionResult);
expect(backgroundMigration.schedule).toHaveBeenCalledWith(expect.any(String), expect.any(Function));
```

- [ ] **Step 2: Run the focused regression suite and verify it fails before the contract update**

Run: `pnpm vitest run src/main/ipc/__tests__/session.test.ts src/main/services/agent/__tests__/CodexWorkspaceSessionHistory.test.ts`

Expected: FAIL until the asynchronous migration boundary is wired into runtime-home preparation.

- [ ] **Step 3: Run all relevant verification after implementation**

Run: `pnpm vitest run src/main/services/agent/__tests__/CodexWorkspaceSessionHistory.test.ts src/main/services/agent/__tests__/CodexWorkspaceHistoryMigrationCoordinator.test.ts src/main/services/agent/__tests__/CodexRuntimeHomeService.test.ts src/main/ipc/__tests__/session.test.ts && pnpm typecheck && pnpm lint`

Expected: PASS with no type errors, lint findings, or legacy migration in the synchronous Codex session-create path.
