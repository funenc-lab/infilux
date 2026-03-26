# Infilux Refactor Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce architectural complexity in the renderer editor flow and main-process service layer without regressing worktree isolation, remote workspace support, or session continuity.

**Architecture:** Refactor in vertical slices. First unify editor behavior behind a shared shell and a single navigation command path, then slim the renderer orchestration layer, then split main-process session/remote responsibilities into smaller services. Each phase must preserve existing behavior and ship independently.

**Tech Stack:** Electron 39, React 19, TypeScript 5.9, Zustand, React Query, Monaco Editor, xterm.js, node-pty, Vitest, Biome

---

## Scope

This is a master plan for one connected refactor program. It is intentionally split into independent chunks that can be executed and reviewed separately:

1. Editor shell and navigation unification
2. Renderer orchestration simplification
3. Main-process service decomposition
4. Minimal regression safety net

Do not start chunk 2 until chunk 1 is stable. Do not start chunk 3 until the renderer-side command and state boundaries are settled.

---

## File Map

### Existing files to modify

- `src/renderer/App.tsx`
- `src/renderer/App/hooks/useTerminalNavigation.ts`
- `src/renderer/App/hooks/useWorktreeSelection.ts`
- `src/renderer/components/layout/MainContent.tsx`
- `src/renderer/components/files/CurrentFilePanel.tsx`
- `src/renderer/components/files/FilePanel.tsx`
- `src/renderer/components/files/EditorArea.tsx`
- `src/renderer/components/files/index.ts`
- `src/renderer/hooks/useEditor.ts`
- `src/renderer/hooks/useFileTree.ts`
- `src/renderer/stores/editor.ts`
- `src/renderer/stores/navigation.ts`
- `src/main/ipc/files.ts`
- `src/main/ipc/index.ts`
- `src/main/services/session/SessionManager.ts`
- `src/main/services/remote/RemoteConnectionManager.ts`

### New renderer files expected

- `src/renderer/components/files/EditorShell.tsx`
- `src/renderer/components/files/useEditorShell.ts`
- `src/renderer/components/files/editorNavigation.ts`
- `src/renderer/services/fileNavigation.ts`

### New main-process files expected

- `src/main/services/session/LocalSessionBackend.ts`
- `src/main/services/session/RemoteSessionBackend.ts`
- `src/main/services/session/SessionEventBus.ts`
- `src/main/services/remote/RemoteProfileStore.ts`
- `src/main/services/remote/RemoteRpcClient.ts`
- `src/main/services/remote/RemoteRuntimeInstaller.ts`
- `src/main/services/remote/RemoteReconnectController.ts`
- `src/main/services/files/FileWatcherRegistry.ts`
- `src/main/services/files/RemoteWatcherRegistry.ts`

### Tests to add

- `src/renderer/components/files/__tests__/editorNavigation.test.ts`
- `src/renderer/components/files/__tests__/editorShell.test.tsx`
- `src/renderer/stores/__tests__/editorWorktreeState.test.ts`
- `src/renderer/App/hooks/__tests__/useTerminalNavigation.test.ts`
- `src/main/services/session/__tests__/SessionManager.test.ts`
- `src/main/services/remote/__tests__/RemoteReconnectController.test.ts`

---

## Chunk 1: Editor Shell And Navigation

### Task 1: Freeze current editor behavior in tests

**Files:**
- Create: `src/renderer/stores/__tests__/editorWorktreeState.test.ts`
- Create: `src/renderer/components/files/__tests__/editorNavigation.test.ts`
- Create: `src/renderer/App/hooks/__tests__/useTerminalNavigation.test.ts`
- Reference: `src/renderer/stores/editor.ts`
- Reference: `src/renderer/stores/navigation.ts`
- Reference: `src/renderer/App/hooks/useTerminalNavigation.ts`

- [ ] Step 1: Add store-level tests for `switchWorktree()` preserving tabs and active file per worktree
- [ ] Step 2: Add tests for one-shot navigation requests opening a file and activating the file tab
- [ ] Step 3: Add tests for preview-mode and cursor-location forwarding
- [ ] Step 4: Run `pnpm test -- editorWorktreeState editorNavigation useTerminalNavigation`
- [ ] Step 5: Confirm tests fail or expose missing seams before refactor

**Acceptance criteria**
- Worktree editor state is explicitly covered by tests
- Navigation semantics are documented by tests before implementation changes

### Task 2: Introduce a single renderer-side file navigation command

**Files:**
- Create: `src/renderer/services/fileNavigation.ts`
- Create: `src/renderer/components/files/editorNavigation.ts`
- Modify: `src/renderer/stores/navigation.ts`
- Modify: `src/renderer/App/hooks/useTerminalNavigation.ts`
- Modify: `src/renderer/hooks/useEditor.ts`

- [ ] Step 1: Define one normalized request shape for open-file navigation
- [ ] Step 2: Move path, line, column, match-length, and preview semantics into one shared helper
- [ ] Step 3: Make `useTerminalNavigation` consume the normalized command instead of reassembling logic ad hoc
- [ ] Step 4: Ensure search, diff, terminal, and definition flows can call the same command path
- [ ] Step 5: Run `pnpm typecheck`
- [ ] Step 6: Run `pnpm test -- editorNavigation useTerminalNavigation`

**Acceptance criteria**
- There is one obvious way to request file navigation in the renderer
- Navigation no longer depends on duplicated assembly logic in multiple call sites

### Task 3: Extract shared editor behavior into `EditorShell`

**Files:**
- Create: `src/renderer/components/files/EditorShell.tsx`
- Create: `src/renderer/components/files/useEditorShell.ts`
- Modify: `src/renderer/components/files/CurrentFilePanel.tsx`
- Modify: `src/renderer/components/files/FilePanel.tsx`
- Modify: `src/renderer/components/files/index.ts`

- [ ] Step 1: Move common tab-close, dirty-check, save, search, and pending-cursor logic into `useEditorShell`
- [ ] Step 2: Create `EditorShell` as the shared wrapper around `EditorArea` and global search dialog integration
- [ ] Step 3: Reduce `CurrentFilePanel` to a layout-only wrapper around `EditorShell`
- [ ] Step 4: Reduce `FilePanel` to tree-and-layout orchestration around `EditorShell`
- [ ] Step 5: Keep tree resize, file tree collapse, and drag-drop behavior inside `FilePanel`
- [ ] Step 6: Run `pnpm typecheck`
- [ ] Step 7: Run `pnpm test -- editorShell`

**Acceptance criteria**
- `CurrentFilePanel` and `FilePanel` no longer duplicate save/close/search behavior
- Shared editor behavior lives in one reusable shell

### Task 4: Split `EditorArea` into stable sub-units without changing UX

**Files:**
- Modify: `src/renderer/components/files/EditorArea.tsx`
- Optional create: `src/renderer/components/files/EditorChrome.tsx`
- Optional create: `src/renderer/components/files/EditorPreviewPane.tsx`
- Optional create: `src/renderer/components/files/EditorSessionIntegration.tsx`

- [ ] Step 1: Extract tab bar, breadcrumb, and external-change banner rendering from `EditorArea`
- [ ] Step 2: Extract preview rendering dispatch for markdown, image, and pdf
- [ ] Step 3: Keep Monaco-specific lifecycle logic isolated in the editor surface portion
- [ ] Step 4: Preserve current props contract for callers in this chunk
- [ ] Step 5: Run `pnpm typecheck`
- [ ] Step 6: Manually verify file open, save, preview toggle, breadcrumb navigation, and external change banner

**Acceptance criteria**
- `EditorArea` stops being the single owner of all editor responsibilities
- Visual behavior remains unchanged for users

**Suggested commit**
```bash
git add src/renderer/components/files src/renderer/hooks/useEditor.ts src/renderer/stores/editor.ts src/renderer/stores/navigation.ts src/renderer/App/hooks/useTerminalNavigation.ts
git commit -m "refactor(editor): 收敛导航语义并提取共享编辑器壳层"
```

---

## Chunk 2: Renderer Application Layer

### Task 5: Reduce `App.tsx` to an application shell

**Files:**
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/App/hooks/index.ts`
- Modify: `src/renderer/App/hooks/useRepositoryState.ts`
- Modify: `src/renderer/App/hooks/useWorktreeState.ts`
- Modify: `src/renderer/App/hooks/useSettingsState.ts`
- Modify: `src/renderer/App/hooks/usePanelState.ts`

- [ ] Step 1: Group repository/worktree/tab orchestration into explicit domain return shapes
- [ ] Step 2: Remove view-specific assembly logic from `App.tsx` where it belongs in hooks or child containers
- [ ] Step 3: Make `App.tsx` primarily compose domains and top-level layout
- [ ] Step 4: Keep behavior stable for drag-drop, settings dialogs, and merge workflows
- [ ] Step 5: Run `pnpm typecheck`
- [ ] Step 6: Manually verify repository selection, worktree switch, settings open/close, and file tab persistence

**Acceptance criteria**
- `App.tsx` becomes materially smaller and easier to scan
- Domain ownership is clearer from hook boundaries

### Task 6: Introduce renderer service boundaries around `window.electronAPI`

**Files:**
- Create: `src/renderer/services/fileClient.ts`
- Create: `src/renderer/services/sessionClient.ts`
- Create: `src/renderer/services/remoteClient.ts`
- Modify: selected callers in `src/renderer/components/*`
- Modify: selected callers in `src/renderer/hooks/*`

- [ ] Step 1: Wrap the most frequently used file/session/remote calls behind typed renderer services
- [ ] Step 2: Replace direct `window.electronAPI` access in editor-related flows first
- [ ] Step 3: Keep service wrappers thin; do not mirror the full preload surface in one pass
- [ ] Step 4: Run `pnpm typecheck`

**Acceptance criteria**
- UI components become less aware of Electron protocol details
- Future preload or IPC changes have fewer renderer touch points

**Suggested commit**
```bash
git add src/renderer/App.tsx src/renderer/App/hooks src/renderer/services src/renderer/components src/renderer/hooks
git commit -m "refactor(renderer): 下沉应用编排并收口 Electron API 调用"
```

---

## Chunk 3: Main-Process Session And Remote Decomposition

### Task 7: Split session backends out of `SessionManager`

**Files:**
- Create: `src/main/services/session/LocalSessionBackend.ts`
- Create: `src/main/services/session/RemoteSessionBackend.ts`
- Create: `src/main/services/session/SessionEventBus.ts`
- Modify: `src/main/services/session/SessionManager.ts`

- [ ] Step 1: Define local and remote backend interfaces around create, attach, detach, kill, write, resize
- [ ] Step 2: Move backend-specific logic out of `SessionManager`
- [ ] Step 3: Keep `SessionManager` as coordinator and state owner only
- [ ] Step 4: Add unit tests around attach/detach and remote-disconnect state transitions
- [ ] Step 5: Run `pnpm typecheck`
- [ ] Step 6: Run `pnpm test -- SessionManager`

**Acceptance criteria**
- `SessionManager` no longer contains full local and remote backend implementations inline
- Remote and local session flows can evolve independently

### Task 8: Split remote responsibilities out of `RemoteConnectionManager`

**Files:**
- Create: `src/main/services/remote/RemoteProfileStore.ts`
- Create: `src/main/services/remote/RemoteRpcClient.ts`
- Create: `src/main/services/remote/RemoteRuntimeInstaller.ts`
- Create: `src/main/services/remote/RemoteReconnectController.ts`
- Modify: `src/main/services/remote/RemoteConnectionManager.ts`

- [ ] Step 1: Extract connection-profile persistence
- [ ] Step 2: Extract remote runtime install and verification flow
- [ ] Step 3: Extract RPC transport and request/response bookkeeping
- [ ] Step 4: Extract reconnect backoff and state transition handling
- [ ] Step 5: Add tests for reconnect policy and state transitions
- [ ] Step 6: Run `pnpm typecheck`
- [ ] Step 7: Run `pnpm test -- RemoteReconnectController`

**Acceptance criteria**
- `RemoteConnectionManager` becomes an orchestrator rather than an everything-service
- Reconnect and runtime flows can be tested in isolation

### Task 9: Make `ipc/files.ts` a thin handler layer

**Files:**
- Create: `src/main/services/files/FileWatcherRegistry.ts`
- Create: `src/main/services/files/RemoteWatcherRegistry.ts`
- Modify: `src/main/ipc/files.ts`
- Modify: `src/main/ipc/index.ts`

- [ ] Step 1: Move watcher bookkeeping and cleanup into dedicated registries
- [ ] Step 2: Keep `ipc/files.ts` focused on request validation, dispatch, and response mapping
- [ ] Step 3: Preserve remote virtual path support and current cleanup semantics
- [ ] Step 4: Run `pnpm typecheck`
- [ ] Step 5: Manually verify file read/write/watch in both local and remote repository contexts

**Acceptance criteria**
- File IPC handler is easier to reason about
- File watcher lifecycle is managed in dedicated services

**Suggested commit**
```bash
git add src/main/services/session src/main/services/remote src/main/services/files src/main/ipc/files.ts src/main/ipc/index.ts
git commit -m "refactor(main): 拆分 session、remote 与 file watcher 职责"
```

---

## Chunk 4: Regression Safety Net

### Task 10: Add a minimum architectural safety test suite

**Files:**
- Create: `src/renderer/components/files/__tests__/editorShell.test.tsx`
- Create: `src/main/services/session/__tests__/SessionManager.test.ts`
- Create: `src/main/services/remote/__tests__/RemoteReconnectController.test.ts`
- Optional create: `vitest.setup.ts`
- Optional modify: `vitest.config.ts`

- [ ] Step 1: Cover worktree editor-state switching
- [ ] Step 2: Cover navigation request behavior
- [ ] Step 3: Cover session attach/detach and dead/reconnecting transitions
- [ ] Step 4: Cover remote reconnect backoff and recoverable-state transitions
- [ ] Step 5: Run `pnpm test`
- [ ] Step 6: Run `pnpm typecheck`
- [ ] Step 7: Run `pnpm lint`

**Acceptance criteria**
- The refactor program has a minimum regression net over the highest-risk flows
- Future structural changes can be made with less manual fear-testing

**Suggested commit**
```bash
git add src/renderer/components/files/__tests__ src/renderer/stores/__tests__ src/renderer/App/hooks/__tests__ src/main/services/session/__tests__ src/main/services/remote/__tests__ vitest.config.ts
git commit -m "test(architecture): 为高风险重构链路补最小回归保护"
```

---

## Verification Matrix

After each chunk, verify the following manually unless automated coverage exists:

- File tab still preserves editor state when switching to terminal or source control
- Worktree switch still restores per-worktree tabs
- Dirty-file prompts still appear only when expected
- Search can still open files at location
- Definition navigation still opens the right file and position
- Remote repositories still load and navigate files
- Session attach/detach and reconnect states still behave correctly

Run after every chunk:

```bash
pnpm typecheck
pnpm lint
pnpm test
```

If `pnpm test` is too slow during early chunks, run the targeted test subset first and the full suite at the end of the chunk.

---

## Delivery Order

Implement in this order:

1. Chunk 1: Editor Shell And Navigation
2. Chunk 2: Renderer Application Layer
3. Chunk 3: Main-Process Session And Remote Decomposition
4. Chunk 4: Regression Safety Net

Do not reorder. Chunk 1 creates the boundary needed for the rest.

---

## Non-Goals

- No visual redesign in this plan
- No technology-stack migration
- No rewrite of Monaco integration from scratch
- No large-scale rename-only churn
- No expansion of feature scope during refactor

---

## Expected Outcomes

By the end of this plan:

- Editor behavior is defined once instead of twice
- File navigation has one primary semantic path
- `App.tsx` is an application shell rather than a feature dumping ground
- Main-process remote and session logic are decomposed into smaller units
- The highest-risk flows have minimum regression coverage
