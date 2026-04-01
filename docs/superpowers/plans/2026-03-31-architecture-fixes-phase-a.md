# Architecture Fixes Phase A Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce architecture drift in three targeted areas without broad refactors: unify Web Inspector IPC contracts, move settings side effects out of the settings store, and extract temp workspace orchestration out of `App.tsx`.

**Architecture:** Keep behavior stable while tightening boundaries. Shared IPC constants become the single source of truth for Web Inspector, settings runtime side effects move into a dedicated renderer runtime module driven by store state changes, and temp workspace orchestration becomes an isolated app hook with focused helpers.

**Tech Stack:** Electron IPC, React 19, Zustand, TypeScript, Vitest.

---

## Chunk 1: Web Inspector IPC contract

### Task 1: Add failing IPC contract coverage
**Files:**
- Modify: `src/shared/types/ipc.ts`
- Modify: `src/preload/__tests__/index.test.ts`
- Modify: `src/main/ipc/__tests__/supportingHandlers.test.ts`
- Modify: `src/main/services/webInspector/__tests__/WebInspectorServer.test.ts`

- [ ] **Step 1: Add failing assertions for Web Inspector invoke and event channels using `IPC_CHANNELS`**
- [ ] **Step 2: Run focused tests and verify failure**
- [ ] **Step 3: Update shared constants, preload bridge, main handlers, and Web Inspector service event emission**
- [ ] **Step 4: Re-run focused tests and verify pass**

## Chunk 2: Settings runtime extraction

### Task 2: Add failing runtime synchronization coverage
**Files:**
- Create: `src/renderer/stores/settings/runtime.ts`
- Modify: `src/renderer/stores/settings/index.ts`
- Modify: `src/renderer/stores/settings/__tests__/setters.test.ts`
- Modify: `src/renderer/stores/settings/__tests__/rehydrate.test.ts`

- [ ] **Step 1: Add failing tests that prove settings setters remain state-only while runtime synchronization still applies side effects**
- [ ] **Step 2: Run focused settings tests and verify failure**
- [ ] **Step 3: Implement dedicated settings runtime synchronization and simplify store setters**
- [ ] **Step 4: Re-run focused settings tests and verify pass**

## Chunk 3: Temp workspace orchestration extraction

### Task 3: Extract temp workspace actions from `App.tsx`
**Files:**
- Create: `src/renderer/App/hooks/useTempWorkspaceActions.ts`
- Create: `src/renderer/App/hooks/__tests__/useTempWorkspaceActions.test.ts`
- Modify: `src/renderer/App/hooks/index.ts`
- Modify: `src/renderer/App.tsx`

- [ ] **Step 1: Add failing tests for extracted temp workspace helper behavior**
- [ ] **Step 2: Run the focused temp workspace test and verify failure**
- [ ] **Step 3: Implement the new hook and switch `App.tsx` to it without changing behavior**
- [ ] **Step 4: Re-run the focused temp workspace test and verify pass**

## Chunk 4: Verification

### Task 4: Run targeted and broad verification
**Files:**
- Modify: none

- [ ] **Step 1: Run focused Web Inspector, settings, and temp workspace tests**
- [ ] **Step 2: Run `pnpm typecheck`**
- [ ] **Step 3: Run `pnpm lint`**
