# Project Worktree Claude Policy Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only global Claude capability catalog plus configurable project and worktree policy controls that gate capabilities and MCP before agent session launch.

**Architecture:** Keep discovery, policy storage, policy resolution, runtime projection, and UI editing as separate modules. Store project/worktree policy in renderer-managed repository/worktree persistence, pass explicit workspace policy context through agent launch metadata, and perform launch-time preparation in main before the generic session manager creates the shell session. Reuse the same resolver and projector for local and remote workspaces so only the write adapter differs.

**Tech Stack:** Electron 39, React 19, TypeScript 5.9, Zustand, Vitest, Tailwind CSS 4, Electron IPC

**Execution Notes:** Follow @superpowers:test-driven-development for each task and finish with @superpowers:verification-before-completion.

---

## File Map

### Shared Contracts

- Create: `src/shared/types/claudePolicy.ts`
  - Owns policy catalog, project/worktree policy, effective result, and launch metadata contracts.
- Modify: `src/shared/types/index.ts`
  - Re-export the new Claude policy domain types.
- Modify: `src/shared/types/ipc.ts`
  - Add explicit IPC channels for catalog read, policy preview, and launch preparation.

### Renderer Persistence And UI

- Modify: `src/renderer/App/storage.ts`
  - Add repository/worktree policy storage keys, helpers, normalization, and cleanup-friendly accessors.
- Modify: `src/renderer/App/__tests__/storage.test.ts`
  - Cover project/worktree policy persistence behavior.
- Modify: `src/renderer/components/settings/constants.ts`
  - Add a settings category for the global catalog view.
- Modify: `src/renderer/components/settings/SettingsShell.tsx`
  - Render the new read-only catalog page.
- Create: `src/renderer/components/settings/claude-policy/ClaudeCapabilityCatalogSection.tsx`
  - Read-only catalog UI with search and source grouping.
- Create: `src/renderer/components/settings/claude-policy/ClaudePolicyEditorDialog.tsx`
  - Shared editor for project and worktree policy.
- Create: `src/renderer/components/settings/claude-policy/ClaudePolicyCapabilityList.tsx`
  - Capability allow/block list rendering.
- Create: `src/renderer/components/settings/claude-policy/ClaudePolicyMcpList.tsx`
  - Shared/personal MCP allow/block rendering.
- Create: `src/renderer/components/settings/claude-policy/ClaudePolicyPreview.tsx`
  - Effective-preview panel with provenance and stale-session hints.
- Create: `src/renderer/components/settings/claude-policy/index.ts`
  - Re-export policy UI surface.
- Modify: `src/renderer/components/repository/RepositorySettingsDialog.tsx`
  - Add project policy summary and editor entry point.
- Modify: `src/renderer/components/layout/TreeSidebar.tsx`
  - Add worktree policy entry point and worktree-level dialog orchestration.
- Create: `src/renderer/components/repository/__tests__/RepositorySettingsDialog.test.tsx`
  - Cover project policy summary and launch of the editor.
- Create: `src/renderer/components/settings/claude-policy/__tests__/ClaudeCapabilityCatalogSection.test.tsx`
  - Cover catalog rendering and read-only behavior.
- Create: `src/renderer/components/settings/claude-policy/__tests__/ClaudePolicyEditorDialog.test.tsx`
  - Cover policy editor allow/block and preview wiring.

### Main Process Policy Runtime

- Create: `src/main/services/claude/CapabilityCatalogService.ts`
  - Discover subagents, commands, legacy skills, and MCP sources for local/remote contexts.
- Create: `src/main/services/claude/ClaudePolicyResolver.ts`
  - Produce effective capabilities, effective MCP, provenance, and hash from catalog + policies.
- Create: `src/main/services/claude/ClaudeRuntimeProjector.ts`
  - Project effective config into local/remote workspace runtime files and user-scope project state.
- Create: `src/main/services/claude/ClaudeSessionLaunchPreparation.ts`
  - Bridge launch metadata to resolver + projector without polluting `SessionManager`.
- Create: `src/main/ipc/claudePolicy.ts`
  - IPC handlers for catalog read, preview, and launch preparation.
- Modify: `src/main/ipc/index.ts`
  - Register the new policy handlers.
- Modify: `src/main/ipc/session.ts`
  - Invoke launch preparation for agent sessions before calling the generic session manager.
- Modify: `src/main/services/remote/RemoteEnvironmentService.ts`
  - Add remote file/project-state helpers required by the projector.
- Modify: `src/main/services/claude/ClaudeWorkspaceTrust.ts`
  - Reuse and extend project-scope user settings writing where local MCP approval/state is needed.
- Create: `src/main/services/claude/__tests__/CapabilityCatalogService.test.ts`
  - Verify capability discovery and source tagging.
- Create: `src/main/services/claude/__tests__/ClaudePolicyResolver.test.ts`
  - Verify allow/block precedence, inheritance, provenance, and hash stability.
- Create: `src/main/services/claude/__tests__/ClaudeSessionLaunchPreparation.test.ts`
  - Verify launch preparation invokes resolver/projector and returns launch metadata.
- Create: `src/main/ipc/__tests__/claudePolicy.test.ts`
  - Verify IPC contracts for catalog, preview, and prepare-launch.
- Modify: `src/main/ipc/__tests__/session.test.ts`
  - Verify session creation runs policy preparation for agent launches.

### Agent Launch Wiring

- Modify: `src/renderer/components/chat/AgentPanel.tsx`
  - Pass explicit `repoPath` to `AgentTerminal`.
- Modify: `src/renderer/components/chat/AgentTerminal.tsx`
  - Build workspace policy context before launch and surface stale policy state.
- Create: `src/renderer/components/chat/claudePolicyLaunch.ts`
  - Pure helper for launch context assembly and stale-state derivation.
- Create: `src/renderer/components/chat/__tests__/claudePolicyLaunch.test.ts`
  - Verify context assembly and stale-state rules.
- Modify: `src/renderer/hooks/useXterm.ts`
  - Forward launch metadata to `session.create` exactly once.
- Modify: `src/renderer/components/chat/SessionBar.tsx`
  - Render policy-stale status for active sessions when applicable.
- Modify: `src/renderer/stores/agentSessions.ts`
  - Persist policy hash / stale markers in session records.
- Create: `src/renderer/components/chat/__tests__/sessionPolicyStaleNotice.test.tsx`
  - Verify stale indicator rendering without regressing existing session UI.

### Bridge Tests

- Modify: `src/preload/index.ts`
  - Expose `electronAPI.claudePolicy`.
- Modify: `src/preload/__tests__/index.test.ts`
  - Cover the new preload bridge methods.

---

## Chunk 1: Contracts And Persistence

### Task 1: Add shared Claude policy contracts and preload bridge

**Files:**
- Create: `src/shared/types/claudePolicy.ts`
- Modify: `src/shared/types/index.ts`
- Modify: `src/shared/types/ipc.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/preload/__tests__/index.test.ts`

- [ ] **Step 1: Write the failing preload bridge test**

Add assertions in `src/preload/__tests__/index.test.ts` for a new API shape:

```ts
api.claudePolicy.catalog.list();
api.claudePolicy.preview.resolve({
  repoPath: '/repo',
  worktreePath: '/repo/worktrees/feat-x',
  projectPolicy: { repoPath: '/repo', allowedCapabilityIds: [], blockedCapabilityIds: [] },
  worktreePolicy: null,
});
api.claudePolicy.launch.prepare({
  repoPath: '/repo',
  worktreePath: '/repo/worktrees/feat-x',
  projectPolicy: { repoPath: '/repo', allowedCapabilityIds: [], blockedCapabilityIds: [] },
  worktreePolicy: null,
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/preload/__tests__/index.test.ts`
Expected: FAIL because `electronAPI.claudePolicy` and its IPC channels do not exist yet.

- [ ] **Step 3: Add the shared contracts**

Create `src/shared/types/claudePolicy.ts` with explicit interfaces, including:

```ts
export type ClaudeCapabilityKind = 'subagent' | 'command' | 'legacy-skill' | 'mcp';

export interface ClaudeCapabilityCatalogItem {
  id: string;
  kind: ClaudeCapabilityKind;
  name: string;
  description?: string;
  sourceScope: 'system' | 'user' | 'project' | 'worktree' | 'remote';
  sourcePath?: string;
  isAvailable: boolean;
  isConfigurable: boolean;
}

export interface ClaudeProjectPolicy {
  repoPath: string;
  allowedCapabilityIds: string[];
  blockedCapabilityIds: string[];
  allowedSharedMcpIds: string[];
  blockedSharedMcpIds: string[];
  allowedPersonalMcpIds: string[];
  blockedPersonalMcpIds: string[];
  updatedAt: number;
}
```

Also add:
- `ClaudeWorktreePolicy`
- `ResolvedClaudePolicy`
- `PrepareClaudePolicyLaunchRequest`
- `PrepareClaudePolicyLaunchResult`

- [ ] **Step 4: Add IPC channels and preload bridge**

Add channels in `src/shared/types/ipc.ts` for:
- `CLAUDE_POLICY_CATALOG_LIST`
- `CLAUDE_POLICY_PREVIEW_RESOLVE`
- `CLAUDE_POLICY_LAUNCH_PREPARE`

Expose them in `src/preload/index.ts` under:

```ts
claudePolicy: {
  catalog: { list: (...) => ... },
  preview: { resolve: (...) => ... },
  launch: { prepare: (...) => ... },
}
```

- [ ] **Step 5: Re-run the preload test**

Run: `pnpm vitest run src/preload/__tests__/index.test.ts`
Expected: PASS

- [ ] **Step 6: Commit the contract bridge**

Run:
```bash
git add \
  src/shared/types/claudePolicy.ts \
  src/shared/types/index.ts \
  src/shared/types/ipc.ts \
  src/preload/index.ts \
  src/preload/__tests__/index.test.ts
git commit -m "feat(claude-policy): add shared policy contracts"
```

### Task 2: Add project/worktree policy persistence helpers

**Files:**
- Modify: `src/renderer/App/storage.ts`
- Modify: `src/renderer/App/__tests__/storage.test.ts`

- [ ] **Step 1: Write the failing storage tests**

Add coverage for:
- `getRepositoryClaudePolicy(repoPath)`
- `saveRepositoryClaudePolicy(repoPath, policy)`
- `getWorktreeClaudePolicy(repoPath, worktreePath)`
- `saveWorktreeClaudePolicy(repoPath, worktreePath, policy)`
- safe fallback for malformed JSON

Use the existing `loadStorageModule()` pattern in `src/renderer/App/__tests__/storage.test.ts`.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/renderer/App/__tests__/storage.test.ts`
Expected: FAIL because the new helpers and storage keys do not exist.

- [ ] **Step 3: Add storage keys and helpers**

Extend `STORAGE_KEYS` with:
- `REPOSITORY_CLAUDE_POLICIES`
- `WORKTREE_CLAUDE_POLICIES`

Implement normalized helpers in `src/renderer/App/storage.ts`:

```ts
export function getRepositoryClaudePolicy(repoPath: string): ClaudeProjectPolicy | null;
export function saveRepositoryClaudePolicy(repoPath: string, policy: ClaudeProjectPolicy): void;
export function getWorktreeClaudePolicy(
  repoPath: string,
  worktreePath: string
): ClaudeWorktreePolicy | null;
export function saveWorktreeClaudePolicy(
  repoPath: string,
  worktreePath: string,
  policy: ClaudeWorktreePolicy
): void;
```

Key requirement:
- normalize `repoPath` and `worktreePath` the same way existing repository/worktree keys are normalized
- return `null` rather than unsafe partial objects when stored data is malformed

- [ ] **Step 4: Re-run the storage test**

Run: `pnpm vitest run src/renderer/App/__tests__/storage.test.ts`
Expected: PASS

- [ ] **Step 5: Commit the persistence layer**

Run:
```bash
git add src/renderer/App/storage.ts src/renderer/App/__tests__/storage.test.ts
git commit -m "feat(claude-policy): persist project and worktree policy"
```

---

## Chunk 2: Main Policy Runtime

### Task 3: Build catalog discovery and policy resolution

**Files:**
- Create: `src/main/services/claude/CapabilityCatalogService.ts`
- Create: `src/main/services/claude/ClaudePolicyResolver.ts`
- Create: `src/main/services/claude/__tests__/CapabilityCatalogService.test.ts`
- Create: `src/main/services/claude/__tests__/ClaudePolicyResolver.test.ts`

- [ ] **Step 1: Write the failing service tests**

Add catalog discovery expectations for:
- local commands / legacy skills
- remote commands / legacy skills
- MCP source normalization
- sourceScope tagging

Add resolver expectations for:
- project allow only
- project block wins over allow
- worktree block overrides project allow
- worktree allow restores only when not blocked
- stable hash for identical effective results

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
pnpm vitest run \
  src/main/services/claude/__tests__/CapabilityCatalogService.test.ts \
  src/main/services/claude/__tests__/ClaudePolicyResolver.test.ts
```

Expected: FAIL because the services do not exist yet.

- [ ] **Step 3: Implement `CapabilityCatalogService`**

Create a focused service that reuses existing Claude discovery helpers where possible:
- command discovery from the current completions sources
- legacy skill discovery from the current skill scan logic
- MCP discovery from project files plus user/project-state adapters

Required API:

```ts
export async function listClaudeCapabilities(
  params: { repoPath?: string; worktreePath?: string }
): Promise<ClaudeCapabilityCatalogItem[]>;
```

- [ ] **Step 4: Implement `ClaudePolicyResolver`**

Resolve:
- effective capability set
- effective shared MCP set
- effective personal MCP set
- provenance map
- stable hash

Use pure helper functions for:
- `applyAllowBlock`
- `buildResolvedCapabilityMap`
- `buildResolvedMcpMap`
- `createResolvedPolicyHash`

- [ ] **Step 5: Re-run the focused service tests**

Run:
```bash
pnpm vitest run \
  src/main/services/claude/__tests__/CapabilityCatalogService.test.ts \
  src/main/services/claude/__tests__/ClaudePolicyResolver.test.ts
```

Expected: PASS

- [ ] **Step 6: Commit discovery and resolution**

Run:
```bash
git add \
  src/main/services/claude/CapabilityCatalogService.ts \
  src/main/services/claude/ClaudePolicyResolver.ts \
  src/main/services/claude/__tests__/CapabilityCatalogService.test.ts \
  src/main/services/claude/__tests__/ClaudePolicyResolver.test.ts
git commit -m "feat(claude-policy): add catalog and resolver"
```

### Task 4: Add launch preparation, projection, and policy IPC

**Files:**
- Create: `src/main/services/claude/ClaudeRuntimeProjector.ts`
- Create: `src/main/services/claude/ClaudeSessionLaunchPreparation.ts`
- Create: `src/main/ipc/claudePolicy.ts`
- Modify: `src/main/ipc/index.ts`
- Modify: `src/main/services/remote/RemoteEnvironmentService.ts`
- Modify: `src/main/services/claude/ClaudeWorkspaceTrust.ts`
- Create: `src/main/services/claude/__tests__/ClaudeSessionLaunchPreparation.test.ts`
- Create: `src/main/ipc/__tests__/claudePolicy.test.ts`

- [ ] **Step 1: Write the failing projector and IPC tests**

Cover:
- local projection writes the right workspace artifacts
- remote projection calls the remote adapter with the right paths
- launch preparation returns `{ hash, projected, warnings }`
- catalog/preview/prepare-launch handlers delegate to the right services

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
pnpm vitest run \
  src/main/services/claude/__tests__/ClaudeSessionLaunchPreparation.test.ts \
  src/main/ipc/__tests__/claudePolicy.test.ts
```

Expected: FAIL because the projector, launch preparation, and IPC handlers do not exist.

- [ ] **Step 3: Implement the runtime projector**

Project the effective result into:
- `.claude/agents/`
- `.claude/commands/`
- `.mcp.json`
- user-scope project state where local MCP approval/state must be updated

Required behavior:
- hash-aware no-op when nothing changed
- explicit local vs remote adapter boundary
- structured `warnings` and `errors`

- [ ] **Step 4: Implement launch preparation**

Create a Claude-specific pre-launch orchestrator, not a `SessionManager` concern:

```ts
export async function prepareClaudeAgentLaunch(
  request: PrepareClaudePolicyLaunchRequest
): Promise<PrepareClaudePolicyLaunchResult>;
```

Input should include explicit policy context from renderer:
- `repoPath`
- `worktreePath`
- `projectPolicy`
- `worktreePolicy`

This avoids forcing main to read renderer local storage.

- [ ] **Step 5: Implement policy IPC**

Register handlers for:
- catalog list
- effective preview
- prepare launch

Keep the handler thin and return only serializable payloads.

- [ ] **Step 6: Re-run the focused tests**

Run:
```bash
pnpm vitest run \
  src/main/services/claude/__tests__/ClaudeSessionLaunchPreparation.test.ts \
  src/main/ipc/__tests__/claudePolicy.test.ts
```

Expected: PASS

- [ ] **Step 7: Commit the main-side runtime**

Run:
```bash
git add \
  src/main/services/claude/ClaudeRuntimeProjector.ts \
  src/main/services/claude/ClaudeSessionLaunchPreparation.ts \
  src/main/ipc/claudePolicy.ts \
  src/main/ipc/index.ts \
  src/main/services/remote/RemoteEnvironmentService.ts \
  src/main/services/claude/ClaudeWorkspaceTrust.ts \
  src/main/services/claude/__tests__/ClaudeSessionLaunchPreparation.test.ts \
  src/main/ipc/__tests__/claudePolicy.test.ts
git commit -m "feat(claude-policy): add launch preparation runtime"
```

---

## Chunk 3: Global Catalog And Policy Editor UI

### Task 5: Add the read-only global catalog view

**Files:**
- Modify: `src/renderer/components/settings/constants.ts`
- Modify: `src/renderer/components/settings/SettingsShell.tsx`
- Create: `src/renderer/components/settings/claude-policy/ClaudeCapabilityCatalogSection.tsx`
- Create: `src/renderer/components/settings/claude-policy/index.ts`
- Create: `src/renderer/components/settings/claude-policy/__tests__/ClaudeCapabilityCatalogSection.test.tsx`

- [ ] **Step 1: Write the failing catalog UI test**

Cover:
- category appears in settings navigation
- catalog renders grouped read-only items
- no allow/block editing controls render in the global view

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/renderer/components/settings/claude-policy/__tests__/ClaudeCapabilityCatalogSection.test.tsx`
Expected: FAIL because the category and component do not exist.

- [ ] **Step 3: Implement the catalog page**

Add a new settings category such as `claudeCatalog`.

Implement a read-only section that:
- fetches `window.electronAPI.claudePolicy.catalog.list()`
- groups by `sourceScope`
- shows type badges and source labels
- supports basic search filtering

- [ ] **Step 4: Re-run the catalog UI test**

Run: `pnpm vitest run src/renderer/components/settings/claude-policy/__tests__/ClaudeCapabilityCatalogSection.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit the catalog view**

Run:
```bash
git add \
  src/renderer/components/settings/constants.ts \
  src/renderer/components/settings/SettingsShell.tsx \
  src/renderer/components/settings/claude-policy/ClaudeCapabilityCatalogSection.tsx \
  src/renderer/components/settings/claude-policy/index.ts \
  src/renderer/components/settings/claude-policy/__tests__/ClaudeCapabilityCatalogSection.test.tsx
git commit -m "feat(claude-policy): add global capability catalog"
```

### Task 6: Add project and worktree policy editing surfaces

**Files:**
- Create: `src/renderer/components/settings/claude-policy/ClaudePolicyEditorDialog.tsx`
- Create: `src/renderer/components/settings/claude-policy/ClaudePolicyCapabilityList.tsx`
- Create: `src/renderer/components/settings/claude-policy/ClaudePolicyMcpList.tsx`
- Create: `src/renderer/components/settings/claude-policy/ClaudePolicyPreview.tsx`
- Modify: `src/renderer/components/repository/RepositorySettingsDialog.tsx`
- Modify: `src/renderer/components/layout/TreeSidebar.tsx`
- Create: `src/renderer/components/repository/__tests__/RepositorySettingsDialog.test.tsx`
- Create: `src/renderer/components/settings/claude-policy/__tests__/ClaudePolicyEditorDialog.test.tsx`

- [ ] **Step 1: Write the failing editor tests**

Cover:
- repository settings show policy summary counts
- clicking `Edit Policy` opens the shared editor
- editor toggles capability allow/block state
- editor requests an effective preview from IPC
- Tree Sidebar exposes a `Worktree Policy` action

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
pnpm vitest run \
  src/renderer/components/repository/__tests__/RepositorySettingsDialog.test.tsx \
  src/renderer/components/settings/claude-policy/__tests__/ClaudePolicyEditorDialog.test.tsx \
  src/renderer/components/layout/__tests__/treeSidebarRenderSmoke.test.ts
```

Expected: FAIL because the summary/editor/action do not exist.

- [ ] **Step 3: Implement the shared policy editor**

Keep the editor split into:
- scope summary
- capabilities allow/block list
- MCP allow/block list
- effective preview

Required props:

```ts
type ClaudePolicyEditorDialogProps = {
  scope: 'project' | 'worktree';
  repoPath: string;
  worktreePath?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};
```

- [ ] **Step 4: Wire repository and worktree entry points**

Repository:
- show summary counts from `App/storage.ts`
- open the shared editor in project scope

Worktree:
- add `Worktree Policy` action in `TreeSidebar.tsx`
- open the same editor in worktree scope

- [ ] **Step 5: Re-run the focused UI tests**

Run:
```bash
pnpm vitest run \
  src/renderer/components/repository/__tests__/RepositorySettingsDialog.test.tsx \
  src/renderer/components/settings/claude-policy/__tests__/ClaudePolicyEditorDialog.test.tsx \
  src/renderer/components/layout/__tests__/treeSidebarRenderSmoke.test.ts
```

Expected: PASS

- [ ] **Step 6: Commit the policy UI**

Run:
```bash
git add \
  src/renderer/components/settings/claude-policy/ClaudePolicyEditorDialog.tsx \
  src/renderer/components/settings/claude-policy/ClaudePolicyCapabilityList.tsx \
  src/renderer/components/settings/claude-policy/ClaudePolicyMcpList.tsx \
  src/renderer/components/settings/claude-policy/ClaudePolicyPreview.tsx \
  src/renderer/components/repository/RepositorySettingsDialog.tsx \
  src/renderer/components/layout/TreeSidebar.tsx \
  src/renderer/components/repository/__tests__/RepositorySettingsDialog.test.tsx \
  src/renderer/components/settings/claude-policy/__tests__/ClaudePolicyEditorDialog.test.tsx
git commit -m "feat(claude-policy): add project and worktree editor"
```

---

## Chunk 4: Agent Launch Integration

### Task 7: Attach explicit workspace policy context to agent launch

**Files:**
- Modify: `src/renderer/components/chat/AgentPanel.tsx`
- Modify: `src/renderer/components/chat/AgentTerminal.tsx`
- Create: `src/renderer/components/chat/claudePolicyLaunch.ts`
- Create: `src/renderer/components/chat/__tests__/claudePolicyLaunch.test.ts`
- Modify: `src/renderer/hooks/useXterm.ts`
- Modify: `src/main/ipc/session.ts`
- Modify: `src/main/ipc/__tests__/session.test.ts`

- [ ] **Step 1: Write the failing launch-context tests**

Cover:
- launch helper builds `{ repoPath, worktreePath, projectPolicy, worktreePolicy }`
- helper omits worktree policy when inherit-only and absent
- `session.create` receives launch metadata for agent sessions
- `session.create` runs launch preparation before `sessionManager.create`

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
pnpm vitest run \
  src/renderer/components/chat/__tests__/claudePolicyLaunch.test.ts \
  src/main/ipc/__tests__/session.test.ts
```

Expected: FAIL because launch metadata and preflight preparation are missing.

- [ ] **Step 3: Implement the pure launch helper**

Create `src/renderer/components/chat/claudePolicyLaunch.ts` to:
- read project/worktree policy from `App/storage.ts`
- build explicit launch context
- compare returned `configHash` with any existing session hash to derive stale state

Example shape:

```ts
export interface ClaudePolicyLaunchContext {
  repoPath: string;
  worktreePath: string;
  projectPolicy: ClaudeProjectPolicy | null;
  worktreePolicy: ClaudeWorktreePolicy | null;
}
```

- [ ] **Step 4: Pass `repoPath` and launch metadata through the renderer chain**

Update:
- `AgentPanel.tsx` to pass `repoPath` into `AgentTerminal`
- `AgentTerminal.tsx` to call `window.electronAPI.claudePolicy.launch.prepare(...)`
- `useXterm.ts` to include the returned launch metadata in `createOptions.metadata`

- [ ] **Step 5: Prepare agent sessions in `ipc/session.ts`**

Before `sessionManager.create(...)`, detect agent launches with Claude policy metadata and call the new launch-preparation service.

Keep `SessionManager` generic. Do not move Claude-specific projection into the session service itself.

- [ ] **Step 6: Re-run the launch tests**

Run:
```bash
pnpm vitest run \
  src/renderer/components/chat/__tests__/claudePolicyLaunch.test.ts \
  src/main/ipc/__tests__/session.test.ts
```

Expected: PASS

- [ ] **Step 7: Commit the launch preparation path**

Run:
```bash
git add \
  src/renderer/components/chat/AgentPanel.tsx \
  src/renderer/components/chat/AgentTerminal.tsx \
  src/renderer/components/chat/claudePolicyLaunch.ts \
  src/renderer/components/chat/__tests__/claudePolicyLaunch.test.ts \
  src/renderer/hooks/useXterm.ts \
  src/main/ipc/session.ts \
  src/main/ipc/__tests__/session.test.ts
git commit -m "feat(claude-policy): prepare launches before agent sessions"
```

### Task 8: Surface policy-stale session state

**Files:**
- Modify: `src/renderer/components/chat/SessionBar.tsx`
- Modify: `src/renderer/stores/agentSessions.ts`
- Create: `src/renderer/components/chat/__tests__/sessionPolicyStaleNotice.test.tsx`

- [ ] **Step 1: Write the failing stale-state UI test**

Cover:
- a session with `policyStale: true` renders a visible stale indicator
- the indicator does not appear for sessions without policy drift

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/renderer/components/chat/__tests__/sessionPolicyStaleNotice.test.tsx`
Expected: FAIL because session records do not carry policy drift state yet.

- [ ] **Step 3: Add minimal stale-state fields**

Extend the renderer session model with:
- `policyHash?: string`
- `policyStale?: boolean`

Persist the fields in `agentSessions.ts` and render a concise badge or notice in `SessionBar.tsx`.

- [ ] **Step 4: Re-run the stale-state UI test**

Run: `pnpm vitest run src/renderer/components/chat/__tests__/sessionPolicyStaleNotice.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit stale-state UI**

Run:
```bash
git add \
  src/renderer/components/chat/SessionBar.tsx \
  src/renderer/stores/agentSessions.ts \
  src/renderer/components/chat/__tests__/sessionPolicyStaleNotice.test.tsx
git commit -m "feat(claude-policy): show stale session policy state"
```

---

## Chunk 5: Verification

### Task 9: Run focused verification

**Files:**
- Modify: none

- [ ] **Step 1: Run the focused Claude policy suite**

Run:
```bash
pnpm vitest run \
  src/preload/__tests__/index.test.ts \
  src/renderer/App/__tests__/storage.test.ts \
  src/main/services/claude/__tests__/CapabilityCatalogService.test.ts \
  src/main/services/claude/__tests__/ClaudePolicyResolver.test.ts \
  src/main/services/claude/__tests__/ClaudeSessionLaunchPreparation.test.ts \
  src/main/ipc/__tests__/claudePolicy.test.ts \
  src/main/ipc/__tests__/session.test.ts \
  src/renderer/components/settings/claude-policy/__tests__/ClaudeCapabilityCatalogSection.test.tsx \
  src/renderer/components/settings/claude-policy/__tests__/ClaudePolicyEditorDialog.test.tsx \
  src/renderer/components/repository/__tests__/RepositorySettingsDialog.test.tsx \
  src/renderer/components/chat/__tests__/claudePolicyLaunch.test.ts \
  src/renderer/components/chat/__tests__/sessionPolicyStaleNotice.test.tsx \
  src/renderer/components/layout/__tests__/treeSidebarRenderSmoke.test.ts
```

Expected: PASS

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Run lint**

Run: `pnpm lint`
Expected: PASS

- [ ] **Step 4: Run full test suite**

Run: `pnpm test`
Expected: PASS

- [ ] **Step 5: Commit final verification fixes if needed**

Run:
```bash
git add -A
git commit -m "test(claude-policy): finish verification fixes"
```

---

Plan complete and saved to `docs/superpowers/plans/2026-04-10-project-worktree-claude-policy.md`. Ready to execute?
