# Project Configuration Schemes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build reusable project configuration schemes and let repositories/worktrees select one for future agent sessions.

**Architecture:** Schemes live in the settings store as reusable templates. Repository and worktree selections live beside existing app-scoped policy storage. Agent session launch reads effective scheme policy and prompt without writing global prompt files.

**Tech Stack:** Electron 39, React 19, TypeScript 5.9, Zustand, Vitest, existing Claude capability policy pipeline.

## Global Constraints

- Always answer users in Chinese.
- Generated source code and comments must be English only.
- Use `pnpm` for verification.
- Use TDD: write failing tests before production code.
- Preserve existing direct project/worktree policy semantics.
- Do not hot-update running sessions.

---

### Task 1: Shared Scheme Model And Resolver

**Files:**
- Create: `src/shared/types/projectConfigScheme.ts`
- Modify: `src/shared/types/index.ts`
- Test: `src/shared/types/__tests__/projectConfigScheme.test.ts`

**Interfaces:**
- Produces: `ProjectConfigScheme`, `ProjectConfigSchemeSelection`, `createEmptyProjectConfigSchemePolicy()`, `resolveProjectConfigSchemePolicy()`, `resolveProjectConfigSchemePromptPresetId()`.
- Consumes: existing `ClaudePolicyConfig`.

- [ ] Write tests for scheme normalization, policy merge precedence, and prompt preset resolution.
- [ ] Run the focused test and verify RED.
- [ ] Add the shared model and pure resolver.
- [ ] Export the new shared domain file.
- [ ] Run the focused test and verify GREEN.

### Task 2: Settings Store Persistence

**Files:**
- Modify: `src/renderer/stores/settings/types.ts`
- Modify: `src/renderer/stores/settings/index.ts`
- Modify: `src/renderer/stores/settings/migration.ts`
- Test: `src/renderer/stores/settings/__tests__/projectConfigSchemes.test.ts`

**Interfaces:**
- Consumes: `ProjectConfigScheme`.
- Produces: `projectConfigSchemes`, `addProjectConfigScheme`, `updateProjectConfigScheme`, `removeProjectConfigScheme`.

- [ ] Write tests for default empty schemes and migration preserving persisted schemes.
- [ ] Run the focused test and verify RED.
- [ ] Add settings state fields and setters.
- [ ] Add migration fallback.
- [ ] Run the focused test and verify GREEN.

### Task 3: Repository And Worktree Scheme Selection Storage

**Files:**
- Modify: `src/shared/utils/legacyLocalStorage.ts`
- Modify: `src/renderer/App/storage.ts`
- Test: `src/renderer/App/__tests__/projectConfigSchemeSelectionStorage.test.ts`

**Interfaces:**
- Consumes: `ProjectConfigSchemeSelection`.
- Produces: `getProjectConfigSchemeSelection()`, `saveProjectConfigSchemeSelection()`, `getWorktreeConfigSchemeSelection()`, `saveWorktreeConfigSchemeSelection()`.

- [ ] Write tests for path normalization, invalid persisted values, save, and clear.
- [ ] Run the focused test and verify RED.
- [ ] Add managed localStorage keys and storage helpers.
- [ ] Run the focused test and verify GREEN.

### Task 4: Agent Launch Resolution

**Files:**
- Modify: `src/renderer/components/chat/AgentTerminal.tsx`
- Create: `src/renderer/components/chat/projectConfigSchemeLaunch.ts`
- Test: `src/renderer/components/chat/__tests__/projectConfigSchemeLaunch.test.ts`

**Interfaces:**
- Consumes: settings schemes, prompt presets, project/worktree selections, existing direct policies.
- Produces: effective project policy, effective worktree policy, and initial prompt for new sessions.

- [ ] Write tests for repository scheme policy, worktree scheme override, direct policy override, and prompt resolution.
- [ ] Run the focused test and verify RED.
- [ ] Add launch helper.
- [ ] Wire `AgentTerminal` to use helper output for policy metadata and `initialPrompt` fallback.
- [ ] Run the focused test and verify GREEN.

### Task 5: Minimal Settings UI

**Files:**
- Create: `src/renderer/components/settings/project-config-schemes/ProjectConfigSchemesSection.tsx`
- Create: `src/renderer/components/settings/project-config-schemes/ProjectConfigSchemeDialog.tsx`
- Create: `src/renderer/components/settings/project-config-schemes/index.ts`
- Modify: `src/renderer/components/settings/SettingsShell.tsx`
- Modify: `src/renderer/components/settings/constants.ts`
- Test: `src/renderer/components/settings/__tests__/projectConfigSchemesSettings.test.tsx`

**Interfaces:**
- Consumes: settings store scheme setters, prompt presets.
- Produces: a settings category for create/edit/delete scheme and choosing prompt preset.

- [ ] Write tests for creating a scheme and editing prompt preset selection.
- [ ] Run the focused test and verify RED.
- [ ] Add the settings section and dialog.
- [ ] Add settings category navigation.
- [ ] Run the focused test and verify GREEN.

### Task 6: Verification

**Files:**
- No source files.

- [ ] Run targeted tests for changed areas.
- [ ] Run `pnpm typecheck`.
- [ ] Run `pnpm lint`.
- [ ] Report any full-suite gaps honestly.
