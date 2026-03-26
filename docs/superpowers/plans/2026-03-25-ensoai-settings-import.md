# EnsoAI Settings Import Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a settings-page workflow that previews and imports an EnsoAI `settings.json` file into the current shared settings store.

**Architecture:** Keep file selection in the renderer, file parsing and validation in the main process, and reuse the existing shared settings persistence path for the final write. The import flow reads an exported EnsoAI config file, computes a safe diff preview, and applies only the persisted `enso-settings` slice after user confirmation.

**Tech Stack:** Electron IPC, React 19, Zustand persisted settings, Vitest

---

### Task 1: Define import preview contracts

**Files:**
- Create: `src/shared/types/settingsImport.ts`
- Modify: `src/shared/types/index.ts`
- Modify: `src/shared/types/ipc.ts`

- [ ] Add shared TypeScript types for preview rows and apply results.
- [ ] Add dedicated IPC channel constants for preview and apply.
- [ ] Export the new types from the shared type barrel.

### Task 2: Add failing tests for preview generation and settings IPC

**Files:**
- Create: `src/main/services/settings/__tests__/legacyImport.test.ts`
- Modify: `src/main/ipc/__tests__/settings.test.ts`

- [ ] Write a failing service test for nested diff preview generation.
- [ ] Write a failing service test for invalid EnsoAI documents.
- [ ] Write a failing IPC test that verifies import apply writes immediately and toggles the provider watcher when the imported payload changes it.

### Task 3: Implement main-process import preview and apply helpers

**Files:**
- Create: `src/main/services/settings/legacyImport.ts`
- Modify: `src/main/ipc/settings.ts`
- Modify: `src/preload/index.ts`

- [ ] Implement helper functions to extract persisted `enso-settings`, compute stable nested diffs, and build the final imported payload.
- [ ] Add main-process IPC handlers that preview a selected EnsoAI file and apply it through the existing shared settings persistence path.
- [ ] Expose the new settings import methods to the renderer via preload.

### Task 4: Add the settings-page import workflow

**Files:**
- Modify: `src/renderer/components/settings/GeneralSettings.tsx`

- [ ] Add an "Import from EnsoAI" section in General Settings.
- [ ] Let the user select a `settings.json` file and request a preview from the main process.
- [ ] Show a confirmation dialog with changed keys and apply the import only after confirmation.

### Task 5: Verify the change

**Files:**
- Modify: `src/main/services/settings/__tests__/legacyImport.test.ts`
- Modify: `src/main/ipc/__tests__/settings.test.ts`

- [ ] Run the focused Vitest suites for the new service and IPC handlers.
- [ ] Run `pnpm typecheck`.
- [ ] Run `pnpm lint`.
