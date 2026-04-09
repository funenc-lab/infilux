# Agent Session Canvas Display Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a global Agent session display mode setting that switches the current worktree Agent panel between the existing tab/split view and an automatic tiled canvas view.

**Architecture:** Keep `AgentPanel` as the session orchestration boundary and add a renderer-only display mode branch. Persist the new mode in the settings store, keep existing `groupStates` untouched for `tab` mode compatibility, and render `canvas` tiles directly from current-worktree sessions with a small pure layout policy helper.

**Tech Stack:** React 19, TypeScript, Zustand, Vitest, Tailwind CSS 4

---

## Chunk 1: Settings Schema And Controls

### Task 1: Add the persisted settings contract

**Files:**
- Modify: `src/renderer/stores/settings/types.ts`
- Modify: `src/renderer/stores/settings/index.ts`
- Test: `src/renderer/stores/settings/__tests__/setters.test.ts`
- Test: `src/renderer/stores/settings/__tests__/migration.test.ts`

- [ ] **Step 1: Write the failing tests**

Add assertions that the settings store exposes `agentSessionDisplayMode`, defaults it to `tab`, and updates it through a dedicated setter.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/renderer/stores/settings/__tests__/setters.test.ts src/renderer/stores/settings/__tests__/migration.test.ts`
Expected: FAIL because the new field and setter do not exist yet.

- [ ] **Step 3: Write minimal implementation**

Add:
- `AgentSessionDisplayMode = 'tab' | 'canvas'`
- `agentSessionDisplayMode` to `SettingsState`
- `setAgentSessionDisplayMode`
- default value in `getInitialState()`

Keep persisted settings backward compatible by relying on defaults for missing values.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/renderer/stores/settings/__tests__/setters.test.ts src/renderer/stores/settings/__tests__/migration.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/stores/settings/types.ts src/renderer/stores/settings/index.ts src/renderer/stores/settings/__tests__/setters.test.ts src/renderer/stores/settings/__tests__/migration.test.ts
git commit -m "feat: add agent session display mode setting"
```

### Task 2: Expose the setting in General Settings

**Files:**
- Modify: `src/renderer/components/settings/GeneralSettings.tsx`
- Test: `src/renderer/components/settings/__tests__/agentSessionDisplayModeSettings.test.ts`

- [ ] **Step 1: Write the failing test**

Add a focused test that verifies `GeneralSettings` exposes both `Tab` and `Canvas` display choices.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/renderer/components/settings/__tests__/agentSessionDisplayModeSettings.test.ts`
Expected: FAIL because the new settings UI does not exist yet.

- [ ] **Step 3: Write minimal implementation**

Add a settings section that reuses the existing option-card pattern and wires the new setter.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/renderer/components/settings/__tests__/agentSessionDisplayModeSettings.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/settings/GeneralSettings.tsx src/renderer/components/settings/__tests__/agentSessionDisplayModeSettings.test.ts
git commit -m "feat: expose agent session display mode in settings"
```

## Chunk 2: Canvas Layout Policy

### Task 3: Add a pure layout helper for the tiled canvas

**Files:**
- Create: `src/renderer/components/chat/agentCanvasLayout.ts`
- Test: `src/renderer/components/chat/__tests__/agentCanvasLayout.test.ts`

- [ ] **Step 1: Write the failing test**

Cover the column-count policy:
- 1 session => 1 column
- 2-4 sessions => 2 columns
- 5+ sessions => 3 columns

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/renderer/components/chat/__tests__/agentCanvasLayout.test.ts`
Expected: FAIL because the helper does not exist yet.

- [ ] **Step 3: Write minimal implementation**

Add a pure helper that returns the column count and the grid class needed by the canvas renderer.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/renderer/components/chat/__tests__/agentCanvasLayout.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/chat/agentCanvasLayout.ts src/renderer/components/chat/__tests__/agentCanvasLayout.test.ts
git commit -m "feat: add agent canvas layout policy"
```

## Chunk 3: Agent Panel Canvas Rendering

### Task 4: Add the canvas render path without breaking tab mode

**Files:**
- Modify: `src/renderer/components/chat/AgentPanel.tsx`
- Test: `src/renderer/components/chat/__tests__/agentPanelCanvasModeSource.test.ts`

- [ ] **Step 1: Write the failing test**

Verify that `AgentPanel` reads the new display mode setting and includes a distinct `canvas` render branch.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/renderer/components/chat/__tests__/agentPanelCanvasModeSource.test.ts`
Expected: FAIL because `AgentPanel` only renders the current tab/split model.

- [ ] **Step 3: Write minimal implementation**

Implement a canvas branch that:
- Keeps the existing empty-state behavior
- Renders current-worktree sessions as tiles
- Gives each tile its own header, `AgentTerminal`, `EnhancedInputContainer`, and `StatusLine`
- Updates `activeIds[cwd]` when a tile gains focus
- Leaves `groupStates` intact so switching back to `tab` restores the old split layout

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/renderer/components/chat/__tests__/agentPanelCanvasModeSource.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/chat/AgentPanel.tsx src/renderer/components/chat/__tests__/agentPanelCanvasModeSource.test.ts
git commit -m "feat: add tiled canvas mode for agent sessions"
```

## Chunk 4: Verification

### Task 5: Run focused and broad verification

**Files:**
- Modify: none

- [ ] **Step 1: Run focused tests**

Run:
```bash
pnpm vitest run \
  src/renderer/stores/settings/__tests__/setters.test.ts \
  src/renderer/stores/settings/__tests__/migration.test.ts \
  src/renderer/components/settings/__tests__/agentSessionDisplayModeSettings.test.ts \
  src/renderer/components/chat/__tests__/agentCanvasLayout.test.ts \
  src/renderer/components/chat/__tests__/agentPanelCanvasModeSource.test.ts
```

Expected: PASS

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Run lint**

Run: `pnpm lint`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add .
git commit -m "test: verify agent session canvas display mode"
```
