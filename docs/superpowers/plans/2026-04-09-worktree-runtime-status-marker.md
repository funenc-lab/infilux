# Worktree Runtime Status Marker Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the worktree runtime status dot from the title row to a left-aligned status slot without changing any other visual behavior.

**Architecture:** Keep runtime-state semantics inside `WorktreeActivityMarker`, but move its placement into a dedicated leading slot shared by both worktree row variants. Use shared CSS to preserve size, color, and alignment while keeping idle rows layout-stable through a fixed-width slot.

**Tech Stack:** React 19, TypeScript, Tailwind utility classes, shared sidebar CSS, Vitest

---

## Chunk 1: Tests And Shared Structure

### Task 1: Lock the new status-slot layout in tests

**Files:**
- Modify: `src/renderer/components/layout/__tests__/worktreeStatusDotLayout.test.ts`
- Modify: `src/renderer/components/layout/__tests__/sidebarDesignPolicy.test.ts`

- [ ] **Step 1: Write the failing test**

Add assertions that:
- the worktree runtime marker is no longer rendered inside `control-tree-title-row`
- both worktree row variants render a dedicated left status slot
- shared CSS contains the new left-slot styling instead of title-row optical correction

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/renderer/components/layout/__tests__/worktreeStatusDotLayout.test.ts src/renderer/components/layout/__tests__/sidebarDesignPolicy.test.ts`
Expected: FAIL because the current implementation still renders the marker in the title row

- [ ] **Step 3: Write minimal implementation**

Only after the failure is confirmed, move the marker into a shared left slot in both worktree components and update the shared CSS contract.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/renderer/components/layout/__tests__/worktreeStatusDotLayout.test.ts src/renderer/components/layout/__tests__/sidebarDesignPolicy.test.ts`
Expected: PASS

## Chunk 2: Component Move

### Task 2: Move the marker to the left status slot

**Files:**
- Modify: `src/renderer/components/layout/tree-sidebar/WorktreeTreeItem.tsx`
- Modify: `src/renderer/components/layout/worktree-panel/WorktreeItem.tsx`
- Modify: `src/renderer/components/layout/WorktreeActivityMarker.tsx`
- Modify: `src/renderer/styles/globals.css`

- [ ] **Step 1: Keep marker semantics unchanged**

`WorktreeActivityMarker` must continue to:
- render nothing for `idle`
- render the same state colors for `running`, `waiting_input`, and `completed`

- [ ] **Step 2: Add a shared left status slot**

Create a shared slot class for worktree rows that:
- always reserves width
- vertically centers the marker
- sits to the left of the branch glyph

- [ ] **Step 3: Remove marker from title row**

Delete the title-row placement from both worktree row components and mount it in the new leading slot.

- [ ] **Step 4: Keep all other row visuals unchanged**

Do not change:
- branch glyph styling
- title text styling
- diff/sync/action layout
- selected row styling

- [ ] **Step 5: Run focused tests**

Run: `pnpm test src/renderer/components/layout/__tests__/WorktreeActivityMarker.test.ts src/renderer/components/layout/__tests__/worktreeStatusDotLayout.test.ts src/renderer/components/layout/__tests__/sidebarDesignPolicy.test.ts`
Expected: PASS

## Chunk 3: Verification

### Task 3: Final verification

**Files:**
- No new files

- [ ] **Step 1: Run type checks**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 2: Run lint**

Run: `pnpm lint`
Expected: PASS

- [ ] **Step 3: Review diff scope**

Run: `git diff -- src/renderer/components/layout/WorktreeActivityMarker.tsx src/renderer/components/layout/tree-sidebar/WorktreeTreeItem.tsx src/renderer/components/layout/worktree-panel/WorktreeItem.tsx src/renderer/styles/globals.css src/renderer/components/layout/__tests__/worktreeStatusDotLayout.test.ts src/renderer/components/layout/__tests__/sidebarDesignPolicy.test.ts`
Expected: only the status-dot position and its tests changed
