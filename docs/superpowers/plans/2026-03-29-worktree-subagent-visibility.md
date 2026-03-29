# Worktree Subagent Visibility Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the current agent and live subagents beneath worktrees and route clicks into the existing raw terminal conversation view.

**Architecture:** Add a shared live-subagent IPC contract, back it with a Codex log tracker in the main process, and consume it in renderer worktree surfaces without replacing the existing AgentPanel terminal flow.

**Tech Stack:** Electron IPC, TypeScript, Zustand-derived selectors, Vitest.

---

## Chunk 1: Shared contract and Codex tracker

### Task 1: Add failing parser tests
**Files:**
- Create: `src/main/services/agent/__tests__/CodexSubagentTracker.test.ts`
- Create: `src/shared/types/agentSubagent.ts`

- [ ] **Step 1: Write failing tests for nested Codex thread parsing and live filtering**
- [ ] **Step 2: Run the focused test and verify failure**
- [ ] **Step 3: Implement the shared types and tracker parser/service**
- [ ] **Step 4: Run the focused test and verify pass**

### Task 2: Wire IPC exposure
**Files:**
- Modify: `src/shared/types/ipc.ts`
- Modify: `src/shared/types/index.ts`
- Create: `src/main/ipc/agentSubagent.ts`
- Modify: `src/main/ipc/index.ts`
- Modify: `src/preload/index.ts`

- [ ] **Step 1: Add failing contract coverage if needed**
- [ ] **Step 2: Implement IPC channel, preload bridge, and handler registration**
- [ ] **Step 3: Run focused main/preload tests or typecheck target**

## Chunk 2: Renderer worktree integration

### Task 3: Add renderer selectors and polling hook
**Files:**
- Create: `src/renderer/hooks/useLiveSubagents.ts`
- Create: `src/renderer/lib/worktreeAgentSummary.ts`
- Create: `src/renderer/lib/__tests__/worktreeAgentSummary.test.ts`

- [ ] **Step 1: Write failing tests for active-session and subagent grouping selectors**
- [ ] **Step 2: Run the focused renderer test and verify failure**
- [ ] **Step 3: Implement selectors and polling hook**
- [ ] **Step 4: Re-run the focused renderer test and verify pass**

### Task 4: Render worktree agent/subagent rows and click routing
**Files:**
- Create: `src/renderer/components/layout/WorktreeAgentSummary.tsx`
- Modify: `src/renderer/components/layout/TreeSidebar.tsx`
- Modify: `src/renderer/components/layout/WorktreePanel.tsx`
- Modify: `src/renderer/App.tsx`

- [ ] **Step 1: Add worktree item props for active session and live subagents**
- [ ] **Step 2: Render compact parent/subagent buttons under each worktree**
- [ ] **Step 3: Route clicks to worktree selection + chat tab + active parent session**
- [ ] **Step 4: Add/adjust renderer render tests if coverage is practical**

## Chunk 3: Verification

### Task 5: Run targeted verification
**Files:**
- Modify: none

- [ ] **Step 1: Run `pnpm test src/main/services/agent/__tests__/CodexSubagentTracker.test.ts src/renderer/lib/__tests__/worktreeAgentSummary.test.ts`**
- [ ] **Step 2: Run `pnpm typecheck`**
- [ ] **Step 3: Run `pnpm lint` if touched files trigger lint-sensitive paths**
