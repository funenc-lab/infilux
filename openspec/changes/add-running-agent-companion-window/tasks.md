## 1. Projection Model

- [ ] 1.1 Add failing service tests for active-session projection, task association, removal, stale navigation rejection, and snapshot ordering in `src/main/services/agent/__tests__/RunningAgentProjectionService.test.ts`.
- [ ] 1.2 Create shared projection and navigation payload types under `src/shared/types/` and export them from the shared type index.
- [ ] 1.3 Create `RunningAgentProjectionService.ts` that reads existing session and task authorities without duplicating persistence or renderer store state.

## 2. Main Window and IPC Lifecycle

- [ ] 2.1 Add failing IPC tests for snapshot requests, sender-scoped subscription cleanup, and focus navigation in `src/main/ipc/__tests__/runningAgentCompanion.test.ts`.
- [ ] 2.2 Create a dedicated companion IPC module and register it through `src/main/ipc/index.ts`.
- [ ] 2.3 Add failing window lifecycle tests for creation, saved bounds validation, close behavior, and shutdown cleanup in `src/main/windows/__tests__/RunningAgentCompanionWindow.test.ts`.
- [ ] 2.4 Create the companion BrowserWindow module and register cleanup with the application lifecycle.

## 3. Preload and Renderer Entry

- [ ] 3.1 Add preload bridge tests for snapshot, subscription, unsubscribe, navigation, and bounds reset methods.
- [ ] 3.2 Expose the typed companion API through preload and add a dedicated renderer entry point without exposing Node or Electron APIs.
- [ ] 3.3 Add renderer tests for active projection rendering, empty state, stale navigation feedback, keyboard focus, and bounds reset action.
- [ ] 3.4 Integrate the main-window focus request through existing worktree and session selection flow rather than adding a second navigation store.

## 4. Verification

- [ ] 4.1 Add Electron E2E coverage for opening, refreshing, navigating from, closing, and reopening the companion window.
- [ ] 4.2 Run `pnpm typecheck`, `pnpm lint`, focused service and window tests, and `openspec validate add-running-agent-companion-window --strict` before committing.
