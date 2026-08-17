## 1. Shared Contracts and Session Safety

- [ ] 1.1 Add failing shared-type tests for history queries, bounded transcript results, availability states, and rejected binding reasons in `src/shared/types/__tests__/codexSessionHistory.test.ts`.
- [ ] 1.2 Create `src/shared/types/codexSessionHistory.ts`, export it from `src/shared/types/index.ts`, and add typed IPC channel constants in `src/shared/types/ipc.ts` until the shared contract tests pass.
- [ ] 1.3 Add failing unit tests for local, WSL, malformed, missing, and concurrent Codex history reads in `src/main/services/agent/__tests__/CodexSessionHistoryService.test.ts`.
- [ ] 1.4 Implement `src/main/services/agent/CodexSessionHistoryService.ts` with bounded metadata scanning, transcript parsing, request coalescing, serializable unavailable results, and no startup-blocking initialization.
- [ ] 1.5 Extend `AgentProviderSessionService` and `src/main/services/agent/__tests__/AgentProviderSessionService.test.ts` with an explicit bind operation that accepts only same-worktree, unclaimed local Codex provider sessions and preserves prior claims on rejection.

## 2. Main-Process and Preload Bridge

- [ ] 2.1 Add failing request-response and invalid-payload tests in `src/main/ipc/__tests__/codexSessionHistory.test.ts` for list, transcript, and bind handlers.
- [ ] 2.2 Create `src/main/ipc/codexSessionHistory.ts`, register it through `src/main/ipc/index.ts`, and keep handler logic limited to payload validation and serializable service results.
- [ ] 2.3 Extend `src/preload/__tests__/index.test.ts` with bridge-shape tests for every Codex history method and rejected binding result.
- [ ] 2.4 Expose the typed Codex history API through `src/preload/index.ts` and `src/preload/types.ts` without exposing Electron or Node objects to the renderer.

## 3. Codex History User Flow

- [ ] 3.1 Add failing interaction and accessibility tests in `src/renderer/components/chat/__tests__/CodexSessionHistoryDialog.test.tsx` for unavailable remote history, loading, bounded transcript previews, binding success, and rejected binding feedback.
- [ ] 3.2 Create the focused history view model and `CodexSessionHistoryDialog` under `src/renderer/components/chat/`, keeping dialog-local pagination and error state outside `stores/agentSessions.ts`.
- [ ] 3.3 Integrate the dialog with `AgentPanel.tsx`, existing active-session selection, and `useAgentProviderSessionDiscovery.ts` so only eligible native or WSL Codex sessions can open or bind history.
- [ ] 3.4 Extend `e2e/agent-session-recovery.test.ts` or add a focused scenario to prove a manually bound local Codex session survives Infilux restart and does not alter remote-session recovery.

## 4. File-Tree Git Decorations

- [ ] 4.1 Add failing pure-model tests in `src/renderer/components/files/__tests__/fileTreeGitDecorations.test.ts` for staged versus unstaged precedence, conflict aggregation, deleted descendants, rename paths, truncated results, case rules, and remote virtual paths.
- [ ] 4.2 Create `src/renderer/components/files/fileTreeGitDecorations.ts` as a pure mapper from `FileChange[]` to immutable file and directory decoration maps, using existing path normalization helpers and no global cache.
- [ ] 4.3 Extend `FilePanel.tsx` and its focused tests to consume the existing `useFileChanges(rootPath, isActive)` query key and memoize decorations per active worktree without starting a second polling loop.
- [ ] 4.4 Extend `FileTree.tsx` and add renderer tests for token-backed visual indicators, accessible labels, compacted directory paths, clean trees, worktree switches, and status updates after Source Control refresh.
- [ ] 4.5 Run remote-aware file-tree tests to prove decorations are limited to the active remote root and stale data from a previous worktree is never rendered.

## 5. Documentation, Verification, and Delivery

- [ ] 5.1 Update `docs/feature-inventory.md` and relevant nearest `AGENTS.md` guidance only when the final ownership or verification surface changes from the documented architecture.
- [ ] 5.2 Run targeted shared, service, IPC, preload, chat, file-tree, and recovery tests; record the exact commands and outcomes in the change validation notes.
- [ ] 5.3 Run `pnpm typecheck`, `pnpm lint`, and the relevant Electron end-to-end scenario with fresh output; fix any failures within this change scope.
- [ ] 5.4 Run `openspec validate add-session-history-and-file-tree-status --strict`, review every unchecked task, and commit only the completed, verified change artifacts and implementation files with a conventional commit message.
