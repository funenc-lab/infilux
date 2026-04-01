# Worktree Subagent Tree Navigation Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render agent and subagent entries as real worktree child nodes and show the selected subagent transcript directly in the chat main area.

**Architecture:** Replace the current summary-stack rendering with explicit child-row rendering inside worktree items, while keeping worktree-level selection state in `App.tsx`. Update the chat panel branch so selecting a subagent swaps the visible chat content to the transcript panel instead of overlaying it above the parent terminal.

**Tech Stack:** React 19, TypeScript, Vitest, existing renderer stores/hooks.

---

## Chunk 1: Chat panel routing

### Task 1: Make subagent transcript replace the chat main view

**Files:**
- Modify: `src/renderer/components/layout/__tests__/mainContentComponentRender.test.ts`
- Modify: `src/renderer/components/layout/MainContentPanels.tsx`

- [ ] **Step 1: Write the failing renderer expectation**

Add a test that renders `MainContent` with `activeTab="chat"` and a selected subagent, then expects:
- the subagent transcript panel is rendered
- the agent panel is not rendered in the active chat surface

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `pnpm vitest run src/renderer/components/layout/__tests__/mainContentComponentRender.test.ts`

Expected: FAIL because the current implementation still renders both the agent panel and the subagent overlay together.

- [ ] **Step 3: Implement the minimal routing change**

Update `MainContentPanels.tsx` so:
- active chat with `selectedSubagent` renders `SubagentTranscriptPanel` as the primary panel
- the normal `DeferredAgentPanel` branch remains for chat when no subagent is selected
- inactive retained chat panels remain untouched

- [ ] **Step 4: Re-run the focused test to verify it passes**

Run: `pnpm vitest run src/renderer/components/layout/__tests__/mainContentComponentRender.test.ts`

Expected: PASS

## Chunk 2: Worktree child rows

### Task 2: Render agent and subagents as real tree child rows

**Files:**
- Create: `src/renderer/components/layout/WorktreeAgentChildren.tsx`
- Modify: `src/renderer/components/layout/tree-sidebar/WorktreeTreeItem.tsx`
- Modify: `src/renderer/components/layout/worktree-panel/WorktreeItem.tsx`
- Modify: `src/renderer/components/layout/__tests__/treeSidebarRenderSmoke.test.ts`
- Modify: `src/renderer/components/layout/__tests__/worktreePanelSource.ts`
- Modify: `src/renderer/components/layout/__tests__/treeSidebarSource.ts`

- [ ] **Step 1: Write the failing render expectation**

Extend a renderer test so a worktree with an active session and one subagent produces distinct child-row output for:
- the parent agent entry
- the subagent entry

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `pnpm vitest run src/renderer/components/layout/__tests__/treeSidebarRenderSmoke.test.ts`

Expected: FAIL because worktree items currently render `WorktreeAgentSummary` instead of explicit child rows.

- [ ] **Step 3: Implement explicit child-row rendering**

Create a shared renderer component that:
- renders a parent agent row
- renders one row per live subagent
- exposes dedicated click handlers for agent vs subagent
- uses indentation and row affordances that read as worktree children rather than inline metadata

Wire this component into both `WorktreeTreeItem.tsx` and `WorktreeItem.tsx`, replacing `WorktreeAgentSummary`.

- [ ] **Step 4: Re-run the focused test to verify it passes**

Run: `pnpm vitest run src/renderer/components/layout/__tests__/treeSidebarRenderSmoke.test.ts`

Expected: PASS

## Chunk 3: Verification

### Task 3: Run targeted verification

**Files:**
- Modify: none

- [ ] **Step 1: Run renderer-focused tests**

Run: `pnpm vitest run src/renderer/components/layout/__tests__/mainContentComponentRender.test.ts src/renderer/components/layout/__tests__/treeSidebarRenderSmoke.test.ts`

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`

- [ ] **Step 3: Run lint**

Run: `pnpm lint`
