# Agent Startup Follow-up Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the remaining measured main-process filesystem stalls and prevent repeat capability-runtime preparation during new agent session startup.

**Architecture:** Keep session creation responsible only for the minimum runtime contract. Replace Codex orphan pruning's recursive runtime-tree traversal with bounded runtime-home metadata checks. Extend the capability catalog cache to remote scopes without local filesystem watchers. Make Gemini runtime state workspace-scoped and reuse an unchanged materialization manifest. The existing missing-tmux recovery bypass is verified rather than rewritten unless a source-level defect is reproduced.

**Tech Stack:** Electron main process, TypeScript, Node.js filesystem APIs, Vitest.

## Global Constraints

- Preserve all existing Codex session histories and runtime data.
- Do not add Electron or Node access to renderer components.
- Keep user-facing runtime state serializable and preserve local/remote path behavior.
- Write tests before implementation and keep source code and comments in English.

---

### Task 1: Bound Codex orphan-pruning work

**Files:**
- Modify: `src/main/services/agent/AgentRuntimeHomeService.ts`
- Modify: `src/main/services/agent/__tests__/CodexRuntimeHomeService.test.ts`

**Interfaces:**
- Produces: `AgentRuntimeHomeService.pruneOrphanedRuntimeHomes(options)` retaining its public synchronous return contract.
- Consumes: retained runtime keys and active runtime-home paths from `PersistentAgentSessionRepository`.

- [ ] **Step 1: Write the failing test**

Add a runtime home with an old directory timestamp and a newer nested state file. Assert that it is pruned when it is neither persistent nor active, proving pruning no longer recursively treats every nested file as liveness.

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `pnpm vitest run src/main/services/agent/__tests__/CodexRuntimeHomeService.test.ts`

Expected: the old home is retained by the recursive latest-mtime scan.

- [ ] **Step 3: Implement the bounded check**

Replace recursive `collectLatestMtimeMs` with a single `lstatSync(homePath).mtimeMs` check. Active and persistent homes remain explicit retention exemptions; untracked homes use their own directory lifetime as the safe reclamation boundary.

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `pnpm vitest run src/main/services/agent/__tests__/CodexRuntimeHomeService.test.ts`

Expected: all runtime-home lifecycle tests pass.

### Task 2: Cache remote capability catalogs safely

**Files:**
- Modify: `src/main/services/claude/CapabilityCatalogCache.ts`
- Modify: `src/main/services/claude/CapabilityCatalogService.ts`
- Modify: `src/main/services/claude/__tests__/CapabilityCatalogCache.test.ts`

**Interfaces:**
- Produces: `ClaudeCapabilityCatalogCache.getCatalog(request)` caching and coalescing both local and remote scopes.
- Consumes: `CapabilityCatalogWatchTarget` only for local filesystem scopes.

- [ ] **Step 1: Write the failing test**

Replace the remote no-cache expectation with a test that two same-scope remote reads call `listCatalog` once and never create a local watcher. Add a test that explicit remote invalidation causes the next request to refresh.

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `pnpm vitest run src/main/services/claude/__tests__/CapabilityCatalogCache.test.ts`

Expected: remote reads still call discovery twice.

- [ ] **Step 3: Implement remote cache support**

Remove the remote bypass in `getCatalog`, suppress watcher creation for remote virtual paths, and permit `invalidateClaudeCapabilityCatalogWorkspace` to invalidate remote cache keys.

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `pnpm vitest run src/main/services/claude/__tests__/CapabilityCatalogCache.test.ts`

Expected: cached, invalidated, and local-watch catalog tests pass.

### Task 3: Reuse workspace-scoped Gemini runtime materialization

**Files:**
- Modify: `src/main/services/agent/GeminiCapabilityProviderAdapter.ts`
- Modify: `src/main/services/agent/__tests__/GeminiCapabilityProviderAdapter.test.ts`

**Interfaces:**
- Produces: workspace-scoped Gemini runtime home paths and a runtime manifest that permits no-op reuse.
- Consumes: resolved policy hash, workspace path, settings projection, and selected skill source paths.

- [ ] **Step 1: Write the failing tests**

Add tests asserting that repeated equivalent local launches do not remove or recreate the skills directory, and that two worktrees with the same policy hash receive separate Gemini runtime homes.

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `pnpm vitest run src/main/services/agent/__tests__/GeminiCapabilityProviderAdapter.test.ts`

Expected: the current implementation recreates the shared `gemini/<policy-hash>` runtime on every launch.

- [ ] **Step 3: Implement manifest reuse**

Derive a stable runtime key from provider name, normalized workspace identity, and policy hash. Persist a manifest containing the runtime schema version, settings payload, and selected skill source paths. If the manifest exactly matches, retain the runtime files; otherwise rebuild and atomically write the manifest after successful materialization.

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `pnpm vitest run src/main/services/agent/__tests__/GeminiCapabilityProviderAdapter.test.ts`

Expected: local and remote projection tests pass, including runtime reuse and worktree isolation.

### Task 4: Verify missing-tmux recovery behavior and regressions

**Files:**
- Verify: `src/main/services/session/SessionManager.ts`
- Verify: `src/renderer/components/chat/AgentTerminal.tsx`
- Verify: `src/main/services/session/__tests__/SessionManager.test.ts`
- Verify: `src/renderer/hooks/__tests__/xtermSessionRecovery.test.ts`

**Interfaces:**
- Consumes: `missing-host-session` recovery state from persistent session reconciliation.
- Produces: a fresh-session fallback instead of repeated attach attempts for a missing tmux session.

- [ ] **Step 1: Reproduce through existing regression tests**

Run the focused session-manager and renderer recovery tests. Inspect the recovery bypass state flow before changing source.

- [ ] **Step 2: Change source only if the test proves a current failure**

Keep the existing explicit `missing-host-session` bypass when the tests demonstrate it already prevents a repeated attach attempt. Otherwise add one source-level guard and a regression test that sends a missing recovery state through the session launch plan.

- [ ] **Step 3: Run verification**

Run: `pnpm vitest run src/main/services/session/__tests__/SessionManager.test.ts src/renderer/hooks/__tests__/xtermSessionRecovery.test.ts`

Expected: missing tmux sessions fail once and transition to a fresh-session fallback.

### Task 5: Final verification

- [ ] Run focused agent, Claude, session, and renderer tests.
- [ ] Run `pnpm typecheck` and `pnpm lint`.
- [ ] Run `pnpm test -- --reporter=dot --silent` and inspect the final exit code and summary.
- [ ] Review `git diff --check` and preserve unrelated working-tree changes.
