# Codex Worktree History E2E Tests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove that legacy Codex transcript history migrates into one stable worktree history, survives an Electron restart, and remains isolated from sibling worktrees.

**Architecture:** Keep filesystem migration and concurrent runtime-home behavior in the main-process integration tests. Add an Electron scenario with an isolated HOME, a real Git worktree, a seeded legacy transcript, and a deterministic fake Codex executable that reports the session ids visible through `CODEX_HOME/sessions` after receiving `/resume`.

**Tech Stack:** TypeScript, Vitest, Playwright Electron, Node filesystem fixtures, Git worktrees.

## Global Constraints

- Tests must never use the developer's home directory or installed application.
- E2E scenarios must launch `out/main/index.cjs` through `e2e/helpers/electronApp.ts`.
- Every scenario must remove Electron processes and temporary repositories in `finally` or `afterEach`.
- Assertions must observe session ids and launched process environment, not implementation source text.

---

### Task 1: Cover concurrent worktree migration

**Files:**

- Modify: `src/main/services/agent/__tests__/CodexRuntimeHomeService.test.ts`

**Interfaces:**

- Consumes: `CodexRuntimeHomeService.prepareRuntimeHome(runtimeKey, options)`.
- Produces: a regression test proving simultaneous UI homes for one worktree link to one migrated session-history directory.

- [ ] **Step 1: Write the integration test**

Create a legacy `sessions` directory containing a `session_meta` record with `cwd: '/repo/worktree-a'`. Start two `prepareRuntimeHome` calls concurrently with distinct runtime keys and the same `sessionHistoryPath`.

- [ ] **Step 2: Assert observable behavior**

Assert both runtime homes link `sessions` to the identical target directory and that the target contains the literal legacy transcript exactly once.

- [ ] **Step 3: Run the focused test**

Run: `pnpm vitest run src/main/services/agent/__tests__/CodexRuntimeHomeService.test.ts`

Expected: PASS after the existing worktree migration lock serializes both preparations.

### Task 2: Add an isolated Codex resume Electron scenario

**Files:**

- Create: `e2e/helpers/codexWorktreeHistoryScenario.ts`
- Create: `e2e/codex-worktree-history.test.ts`

**Interfaces:**

- Consumes: `launchInfiluxForScenario`, `seedRendererLocalStorageAndReload`, `waitForRepositoryAndWorktree`, and `quitElectronApplication`.
- Produces: `createCodexWorktreeHistoryScenario()` with isolated home, repository, worktree, legacy session id, fake Codex log, and cleanup.

- [ ] **Step 1: Create the scenario fixture**

Build a local Git repository with one linked worktree. Seed `~/.codex/sessions/2026/08/20/rollout-legacy.jsonl` with a literal `session_meta` record for that worktree and a sibling record for another worktree. Configure a fake Codex executable through Infilux settings.

- [ ] **Step 2: Implement fake `/resume` behavior**

The fake executable must write its `CODEX_HOME` and cwd to a JSON-lines log. When stdin contains `/resume`, it must enumerate `.jsonl` files below `CODEX_HOME/sessions`, emit `RESUME_SESSIONS:<comma-separated-thread-ids>`, and append the same visible ids to the log.

- [ ] **Step 3: Write the restart E2E**

Launch the app, hydrate repository local storage, select the worktree, and launch Codex once to perform migration. Quit the app. Launch a new app instance with the same isolated profile, start Codex again, enter `/resume`, and assert the terminal shows the seeded worktree id but not the sibling id.

- [ ] **Step 4: Run the focused E2E**

Run: `pnpm build && pnpm vitest run --config vitest.e2e.config.ts e2e/codex-worktree-history.test.ts`

Expected: PASS with no real Codex account, global home directory, or installed app dependency.

### Task 3: Verify the complete contract

**Files:**

- Test: `src/main/services/agent/__tests__/CodexRuntimeHomeService.test.ts`
- Test: `e2e/codex-worktree-history.test.ts`

- [ ] **Step 1: Run focused main-process tests**

Run: `pnpm vitest run src/main/services/agent/__tests__/CodexRuntimeHomeService.test.ts src/main/services/agent/__tests__/CodexWorkspaceSessionHistory.test.ts`

- [ ] **Step 2: Run the new E2E scenario**

Run: `pnpm vitest run --config vitest.e2e.config.ts e2e/codex-worktree-history.test.ts`

- [ ] **Step 3: Run type and formatting verification**

Run: `pnpm typecheck` and `pnpm exec biome check src/main/services/agent/__tests__/CodexRuntimeHomeService.test.ts e2e/codex-worktree-history.test.ts e2e/helpers/codexWorktreeHistoryScenario.ts`

## Coverage Review

- Legacy current-worktree migration is covered by the Electron restart scenario.
- Sibling-worktree exclusion is covered by the fake `/resume` output assertion.
- Concurrent UI-session migration is covered by the real runtime-home service test.
- The test boundary is the `CODEX_HOME/sessions` contract read by Codex; the actual Codex binary is intentionally replaced because E2E must not require user credentials or mutate personal history.
