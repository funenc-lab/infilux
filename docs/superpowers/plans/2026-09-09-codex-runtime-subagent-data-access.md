# Codex Runtime Subagent Data Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop Infilux from repeatedly accessing the user's global Codex data while a Codex agent is running, without removing Infilux-managed subagent summaries or transcript access.

**Architecture:** Introduce a main-process service that resolves only active Infilux-managed Codex runtime homes and builds path-scoped tracker, session-summary, and transcript readers for each home. Replace the singleton readers that default to `~/.codex`; remove the per-launch legacy session migration inputs that explicitly follow `~/.codex/sessions`.

**Tech Stack:** Electron main process, TypeScript 5.9, Node filesystem APIs, Vitest.

## Global Constraints

- Source code and code comments must be English.
- Preserve user-owned uncommitted changes by working only in the isolated worktree.
- Do not add Electron or Node access to the renderer.
- Do not use `any`, `@ts-ignore`, or type escape hatches.
- Every behavior change has a focused Vitest regression test.
- Do not use Full Disk Access as a workaround.

---

## File Structure

- Create `src/main/services/agent/CodexRuntimeSubagentService.ts`: aggregates subagent data from active Infilux Codex runtime homes and owns per-runtime readers.
- Create `src/main/services/agent/__tests__/CodexRuntimeSubagentService.test.ts`: integration-style coverage using temporary runtime homes.
- Modify `src/main/services/agent/CodexSubagentTracker.ts`: require explicit runtime paths rather than defaulting to the user's global Codex directory.
- Modify `src/main/services/agent/CodexSessionSubagentService.ts`: require an explicit runtime sessions directory.
- Modify `src/main/services/agent/CodexSubagentTranscriptService.ts`: require an explicit runtime sessions directory.
- Modify `src/main/ipc/agentSubagent.ts`: wire the runtime-scoped service to `SessionManager`'s active runtime-home provider.
- Modify `src/main/ipc/session.ts` and `src/main/services/agent/CodexCapabilityProviderAdapter.ts`: stop passing the user's global sessions directory as a runtime migration source.
- Modify `src/main/services/agent/CodexRuntimeHomeService.ts`: migrate only Infilux-owned legacy runtime paths, never the source provider home.
- Update focused tests adjacent to each modified service.

## Test Plan

| Code Change | File/Function | Test Change | Test File |
| --- | --- | --- | --- |
| Runtime-scoped aggregation | `CodexRuntimeSubagentService` | Reads a temporary runtime's `sessions` and `log` directories and never needs a global home path | `CodexRuntimeSubagentService.test.ts` |
| Explicit reader paths | `CodexSubagentTracker`, `CodexSessionSubagentService`, `CodexSubagentTranscriptService` | Existing tracker/session/transcript fixtures provide their directory explicitly | Existing focused agent tests |
| IPC wiring | `registerAgentSubagentHandlers` | Active runtime-home provider is used for live, session, and transcript requests | `agentSubagent` focused test or service integration test |
| Legacy migration boundary | `CodexRuntimeHomeService`, launch callers | Migration source paths exclude `~/.codex/sessions` and preserve Infilux-owned legacy paths | `CodexRuntimeHomeService.test.ts` and launch-adapter tests |

## User Journey

As an Infilux user running a Codex agent, I can see subagent status and transcripts without Infilux polling `~/.codex` or repeatedly causing macOS to request access to another app's data.

### Task 1: Create failing runtime-scoping regression tests

**Files:**
- Create: `src/main/services/agent/__tests__/CodexRuntimeSubagentService.test.ts`
- Modify: `src/main/services/agent/__tests__/CodexRuntimeHomeService.test.ts`
- Modify: `src/main/services/agent/__tests__/CodexSubagentTracker.test.ts`

**Interfaces:**
- Consumes: `CodexRuntimeSubagentService` with an injected `listActiveRuntimeHomePaths(): string[]` provider.
- Produces: Regression coverage that fails while global `~/.codex` defaults and legacy migration inputs remain.

- [ ] **Step 1: Write the failing runtime-scoped aggregation test**

```typescript
it('reads live subagents only from active runtime homes', async () => {
  const runtimeHome = await createRuntimeHomeWithCodexSession();
  const service = new CodexRuntimeSubagentService({
    listActiveRuntimeHomePaths: () => [runtimeHome],
  });

  await expect(service.listLive({ cwds: ['/workspace'] })).resolves.toMatchObject({
    items: [expect.objectContaining({ cwd: '/workspace', provider: 'codex' })],
  });
});
```

- [ ] **Step 2: Run the new test and verify it fails because the service is absent**

Run: `pnpm vitest run src/main/services/agent/__tests__/CodexRuntimeSubagentService.test.ts`

Expected: FAIL with a missing-module or missing-export error for `CodexRuntimeSubagentService`.

- [ ] **Step 3: Write a failing migration-boundary test**

```typescript
it('does not migrate sessions from the user Codex home', async () => {
  const result = await prepareRuntimeHomeWithLegacySources({
    userSessionsPath: '/Users/test/.codex/sessions',
  });

  expect(result.migrationSources).not.toContain('/Users/test/.codex/sessions');
});
```

- [ ] **Step 4: Run the focused migration test and verify it fails for the current legacy source**

Run: `pnpm vitest run src/main/services/agent/__tests__/CodexRuntimeHomeService.test.ts`

Expected: FAIL because the current launch path includes the user Codex sessions directory.

### Task 2: Implement runtime-scoped subagent readers

**Files:**
- Create: `src/main/services/agent/CodexRuntimeSubagentService.ts`
- Modify: `src/main/services/agent/CodexSubagentTracker.ts`
- Modify: `src/main/services/agent/CodexSessionSubagentService.ts`
- Modify: `src/main/services/agent/CodexSubagentTranscriptService.ts`
- Modify: `src/main/ipc/agentSubagent.ts`

**Interfaces:**
- Consumes: `listActiveRuntimeHomePaths(): string[]` from the session layer.
- Produces: `listLive`, `listSession`, and `getTranscript` methods with the existing agent-subagent IPC result types.

- [ ] **Step 1: Implement the smallest path-scoped service**

```typescript
export interface CodexRuntimeSubagentHomeProvider {
  listActiveRuntimeHomePaths(): string[];
}

export class CodexRuntimeSubagentService {
  constructor(private readonly homeProvider: CodexRuntimeSubagentHomeProvider) {}

  async listLive(request: ListLiveAgentSubagentsRequest): Promise<ListLiveAgentSubagentsResult> {
    // Build readers using <runtimeHome>/log/codex-tui.log and <runtimeHome>/sessions.
  }
}
```

- [ ] **Step 2: Remove implicit global-directory defaults**

```typescript
const tracker = new CodexSubagentTracker({
  logPath: path.join(runtimeHomePath, 'log', 'codex-tui.log'),
  sessionsDir: path.join(runtimeHomePath, 'sessions'),
});
```

The tracker, session-summary service, and transcript service must require their paths from the runtime-scoped owner. Do not retain a `~/.codex` fallback.

- [ ] **Step 3: Wire existing IPC handlers to the new service**

```typescript
const codexRuntimeSubagentService = new CodexRuntimeSubagentService({
  listActiveRuntimeHomePaths: () => sessionManager.listActiveCodexRuntimeHomePaths(),
});
```

Keep IPC payloads and renderer APIs unchanged. The main process owns runtime-path selection.

- [ ] **Step 4: Run focused runtime and existing agent tests**

Run: `pnpm vitest run src/main/services/agent/__tests__/CodexRuntimeSubagentService.test.ts src/main/services/agent/__tests__/CodexSubagentTracker.test.ts src/main/services/agent/__tests__/CodexSessionSubagentService.test.ts`

Expected: PASS with runtime-scoped fixtures and no global-path defaults.

### Task 3: Remove execution-time global session migration

**Files:**
- Modify: `src/main/ipc/session.ts`
- Modify: `src/main/services/agent/CodexCapabilityProviderAdapter.ts`
- Modify: `src/main/services/agent/CodexRuntimeHomeService.ts`
- Modify: `src/main/ipc/__tests__/session.test.ts` if it covers launch options
- Modify: `src/main/services/agent/__tests__/CodexRuntimeHomeService.test.ts`

**Interfaces:**
- Consumes: Infilux-owned runtime session paths created by `CodexRuntimeHomeService`.
- Produces: A workspace-session migration that never resolves or enumerates the user's global Codex sessions directory during agent launch.

- [ ] **Step 1: Implement the minimal migration-source restriction**

```typescript
sourceSessionsPaths: [
  ...currentRuntimeLegacySessionPaths,
  ...legacyWorkspaceSessionPaths,
]
```

Remove user-home `legacySessionPaths` from both launch paths and remove `path.join(runtimeHome.sourceHomePath, 'sessions')` from scheduled migration sources.

- [ ] **Step 2: Run migration and launch tests**

Run: `pnpm vitest run src/main/services/agent/__tests__/CodexRuntimeHomeService.test.ts src/main/services/agent/__tests__/CodexCapabilityProviderAdapter.test.ts src/main/ipc/__tests__/session.test.ts`

Expected: PASS. If a referenced test file does not exist, run the nearest existing test file listed by `rg --files src/main/**/__tests__` and record the exact replacement command.

### Task 4: Verify the end-to-end code path

**Files:**
- Modify: Only files required by Tasks 1–3.

- [ ] **Step 1: Run type validation**

Run: `pnpm typecheck`

Expected: PASS.

- [ ] **Step 2: Run lint validation**

Run: `pnpm lint`

Expected: PASS.

- [ ] **Step 3: Run the complete focused test set**

Run: `pnpm vitest run src/main/services/agent/__tests__/CodexRuntimeSubagentService.test.ts src/main/services/agent/__tests__/CodexSubagentTracker.test.ts src/main/services/agent/__tests__/CodexSessionSubagentService.test.ts src/main/services/agent/__tests__/CodexRuntimeHomeService.test.ts`

Expected: PASS.

- [ ] **Step 4: Review the diff for protected-path regressions**

Run: `git diff --check && rg -n 'CODEX_SESSIONS_DIR|CODEX_TUI_LOG_PATH|resolveUserCodexHome\\(\\).*sessions' src/main/ipc/agentSubagent.ts src/main/services/agent`

Expected: no runtime subagent, transcript, or launch-migration flow resolves `~/.codex`.

## Self-Review

- Spec coverage: Tasks 2 and 3 remove the two execution-time paths that repeatedly read global Codex data. Task 1 proves the replacement reader path. Task 4 verifies the TypeScript and runtime-path contract.
- Placeholder scan: no TODO, TBD, or implicit test instructions remain.
- Type consistency: all new APIs remain main-process-only and use the existing shared agent-subagent result types.

## Execution Handoff

The plan is saved in the isolated worktree. The user explicitly requested the fix, so execute it inline with `executing-plans`, preserving review checkpoints and the red-green test cycle.
