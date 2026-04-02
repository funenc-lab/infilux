# Resource Manager Drawer Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a side drawer that shows detailed runtime resources and supports controlled reclamation actions for safe targets.

**Architecture:** Add a typed app-resource contract in shared types, aggregate runtime resources through a focused main-process app resource service, expose snapshot/action APIs through app IPC and preload, and replace the small runtime popover body with a drawer-oriented resource manager UI in the renderer.

**Tech Stack:** Electron, TypeScript, React, Vitest, existing `@/components/ui` sheet/dialog primitives

---

## Chunk 1: Contracts and failing tests

### Task 1: Define the new app resource contract surface

**Files:**
- Modify: `src/shared/types/app.ts`
- Modify: `src/shared/types/ipc.ts`
- Test: `src/renderer/components/layout/__tests__/appResourceStatusModel.test.ts`
- Test: `src/preload/__tests__/index.test.ts`
- Test: `src/main/ipc/__tests__/supportingHandlers.test.ts` or new focused app IPC test

- [ ] **Step 1: Add failing tests for resource snapshot rendering and preload/app IPC contract**
- [ ] **Step 2: Run the focused tests and confirm they fail for missing resource manager contract**
- [ ] **Step 3: Add typed snapshot, resource entry, and action request/result contracts**
- [ ] **Step 4: Re-run focused tests to confirm type-level contract alignment**

### Task 2: Add failing tests for controlled action rules

**Files:**
- Test: `src/renderer/components/layout/__tests__/appResourceStatusModel.test.ts`
- Test: `src/main/services/app/__tests__/AppResourceManager.test.ts`

- [ ] **Step 1: Add failing tests that encode safe-vs-force action visibility rules**
- [ ] **Step 2: Run the focused tests and confirm they fail with the current model/service state**

## Chunk 2: Main-process aggregation and actions

### Task 3: Implement app resource aggregation

**Files:**
- Create: `src/main/services/app/AppResourceManager.ts`
- Create: `src/main/services/app/__tests__/AppResourceManager.test.ts`
- Modify: `src/main/utils/runtimeMemory.ts`
- Modify: `src/main/services/session/SessionManager.ts`
- Modify: `src/main/services/terminal/PtyManager.ts`

- [ ] **Step 1: Add a focused main-process resource service test for Electron process entries, sessions, and support services**
- [ ] **Step 2: Run the service test and confirm it fails**
- [ ] **Step 3: Implement the resource manager service with explicit dependencies and aggregation helpers**
- [ ] **Step 4: Add narrow session/PTY introspection helpers needed by the service**
- [ ] **Step 5: Re-run the service test and keep it green**

### Task 4: Implement controlled reclamation actions

**Files:**
- Modify: `src/main/services/app/AppResourceManager.ts`
- Test: `src/main/services/app/__tests__/AppResourceManager.test.ts`

- [ ] **Step 1: Add failing tests for reload-renderer, kill-session, stop-service, and guarded force-terminate**
- [ ] **Step 2: Run the service test and confirm it fails**
- [ ] **Step 3: Implement action execution with explicit guardrails and stable results**
- [ ] **Step 4: Re-run the service test and keep it green**

## Chunk 3: IPC, preload, renderer, and verification

### Task 5: Wire app IPC and preload bridge

**Files:**
- Modify: `src/main/ipc/app.ts`
- Modify: `src/preload/index.ts`
- Test: `src/main/ipc/__tests__/supportingHandlers.test.ts` or new `app.test.ts`
- Test: `src/preload/__tests__/index.test.ts`

- [ ] **Step 1: Add failing tests for snapshot fetch and action invocation**
- [ ] **Step 2: Run the focused IPC/preload tests and confirm they fail**
- [ ] **Step 3: Implement typed handlers and preload bridge methods**
- [ ] **Step 4: Re-run the focused IPC/preload tests and keep them green**

### Task 6: Replace the popover body with a resource manager drawer

**Files:**
- Modify: `src/renderer/components/layout/AppResourceStatusPopover.tsx`
- Create: `src/renderer/components/layout/AppResourceManagerDrawer.tsx`
- Modify: `src/renderer/components/layout/appResourceStatusModel.ts`
- Create: `src/renderer/components/layout/__tests__/appResourceManagerDrawer.test.tsx`
- Modify: `src/renderer/components/layout/__tests__/appResourceStatusModel.test.ts`

- [ ] **Step 1: Add failing renderer tests for grouped resource rows, action affordances, and confirmation copy**
- [ ] **Step 2: Run the focused renderer tests and confirm they fail**
- [ ] **Step 3: Implement the drawer, grouped resource model, and confirmation flow using existing sheet/dialog primitives**
- [ ] **Step 4: Re-run the focused renderer tests and keep them green**

### Task 7: Final verification

**Files:**
- Verify only

- [ ] **Step 1: Run targeted Vitest suites for app resource service, IPC, preload, and layout resource UI**
- [ ] **Step 2: Run `npx biome check` on changed files**
- [ ] **Step 3: Run `npx tsc --noEmit` if practical in this environment, otherwise report that it remained long-running without claiming success**
