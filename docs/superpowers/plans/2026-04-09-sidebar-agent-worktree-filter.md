# Sidebar Agent Worktree Filter Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Tree Sidebar toggle that keeps the repository-to-worktree hierarchy but only shows worktrees with Agent sessions, including Temp Sessions.

**Architecture:** Keep the feature renderer-local to `TreeSidebar.tsx`, reuse `useWorktreeActivityStore` as the source of truth for `agentCount`, and extend the existing worktree-prefetch path so filtered repos can still be discovered before expansion. The implementation should avoid new store ownership and keep the filter composable with the existing text search.

**Tech Stack:** React 19, TypeScript, Zustand, Vitest, Tailwind CSS 4

---

## Chunk 1: Test First

### Task 1: Add a failing Tree Sidebar interaction test

**Files:**
- Create: `src/renderer/components/layout/__tests__/treeSidebarAgentFilter.test.ts`

- [ ] **Step 1: Write the failing test**

Cover:
- toggle button renders
- enabling it hides repos without Agent worktrees
- only matching worktrees remain under a visible repo
- Temp Sessions only keep matching items

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/renderer/components/layout/__tests__/treeSidebarAgentFilter.test.ts`
Expected: FAIL because the toggle and filtering behavior do not exist yet.

- [ ] **Step 3: Write minimal implementation**

Add the smallest possible Tree Sidebar UI and filter logic to satisfy the test.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/renderer/components/layout/__tests__/treeSidebarAgentFilter.test.ts`
Expected: PASS

## Chunk 2: Tree Sidebar Filter Logic

### Task 2: Add the Agent-only filter path to Tree Sidebar

**Files:**
- Modify: `src/renderer/components/layout/TreeSidebar.tsx`

- [ ] **Step 1: Extend local sidebar state**

Add a local boolean toggle for the Agent-only filter and render a visible button near the existing search field.

- [ ] **Step 2: Reuse the existing activity store**

Use `activities[path].agentCount > 0` as the only match condition for:
- temp sessions
- repo inclusion
- worktree inclusion

- [ ] **Step 3: Keep hierarchy intact**

Do not flatten worktrees globally. Keep the repo row and only prune child worktrees plus unmatched repos.

- [ ] **Step 4: Reuse worktree prefetch**

Ensure the Agent-only filter triggers the same prefetch path currently used by worktree-aware search filtering.

- [ ] **Step 5: Re-run focused test**

Run: `pnpm vitest run src/renderer/components/layout/__tests__/treeSidebarAgentFilter.test.tsx`
Expected: PASS

## Chunk 3: Verification

### Task 3: Run focused verification

**Files:**
- Modify: none

- [ ] **Step 1: Run focused tests**

Run:
```bash
pnpm vitest run \
  src/renderer/components/layout/__tests__/treeSidebarAgentFilter.test.ts \
  src/renderer/components/layout/__tests__/treeSidebarRenderSmoke.test.ts \
  src/renderer/components/layout/__tests__/sidebarWorktreePrefetchPolicy.test.ts \
  src/renderer/components/layout/__tests__/sidebarWorktreePrefetchPolicy.repository.test.ts
```

Expected: PASS

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Run lint**

Run: `pnpm lint`
Expected: PASS
