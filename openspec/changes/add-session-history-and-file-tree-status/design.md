## Context

See proposal.md for motivation and the two delta specifications for required behavior. Infilux already
owns provider-session discovery in `src/main/services/agent/AgentProviderSessionService`, persistent
session identity in `src/main/services/session/`, and file-change polling in the React Query
`useFileChanges` hook. The design extends those seams instead of moving lifecycle ownership.

## Goals / Non-Goals

**Goals:**

- Provide recoverable local and WSL Codex history without blocking startup or changing remote session
  recovery behavior.
- Reuse existing provider-session claim rules when an explicit historical binding is requested.
- Project existing Source Control changes into FileTree with a pure, testable decoration model.
- Preserve existing worktree switching, React Query cache ownership, and remote virtual-path support.

**Non-Goals:**

- Indexing Codex sessions on remote hosts in this change.
- Replacing persistent agent session storage or terminal transcript behavior.
- Adding a database dependency, another Git polling loop, or a general multi-provider history UI.
- Changing Source Control staging, diff, or commit behavior.

## Decisions

### Keep Codex history in the agent domain

Create `src/main/services/agent/CodexSessionHistoryService.ts` with focused metadata discovery,
bounded transcript parsing, and in-memory request coalescing. Reuse `CodexHomePaths`, JSONL line
readers, and Codex metadata parsing where they already exist. `AgentProviderSessionService` remains
the owner of UI-session to provider-session claims and gains one explicit bind operation rather than
exposing its internal maps.

The alternative is a persistent SQLite index modeled on the upstream project. It is rejected for the
first change because Infilux already performs bounded targeted discovery, supports app-scoped Codex
homes, and must not introduce a second persistent session authority before query behavior is proven.

### Use typed cross-process history contracts

Add `src/shared/types/codexSessionHistory.ts` for query, list, transcript, availability, and bind
result payloads. Add named IPC channels in `src/shared/types/ipc.ts`, a dedicated
`src/main/ipc/codexSessionHistory.ts` handler module, preload methods in `src/preload/index.ts`, and
registration in `src/main/ipc/index.ts`. IPC results contain explicit availability or error fields;
main handlers do not return filesystem errors or Electron objects directly.

The renderer determines whether a target is local, WSL, or remote from existing repository/session
context before issuing a query. The service repeats scope validation so a renderer mistake cannot
bind local history to a remote session.

### Make history presentation a chat-domain leaf feature

Create a small history-dialog model and a `CodexSessionHistoryDialog` under
`src/renderer/components/chat/`. `AgentPanel` supplies the active session and worktree context, while
`stores/agentSessions.ts` remains the single renderer source of session selection and binding state.
The dialog owns only open state, pagination limit, loading state, and transient errors.

### Derive file-tree decoration maps from React Query data

Create `src/renderer/components/files/fileTreeGitDecorations.ts` as a pure path-normalizing mapper
from `FileChange[]` to file and directory decoration maps. `FilePanel` calls the existing
`useFileChanges(rootPath, isActive)` hook and passes the derived map into `FileTree`; React Query
deduplicates the existing query key when Source Control is active. FileTree and its node component
render token-backed icon or text indicators with accessible labels.

The alternative is adding decoration state to the editor or Source Control Zustand store. It is
rejected because React Query already owns the remote-aware server state and editor state must not
become a Git cache.

### Preserve path and recovery safety

History matching uses normalized local or WSL paths and rejects remote repository contexts. Decoration
matching uses repository platform semantics and keeps maps scoped by the active root path. Worktree
changes replace the input map rather than mutating a global map. Missing, stale, or truncated data
results in fewer decorations, never a claim that a path is clean.

## Risks / Trade-offs

- Large or malformed Codex session trees can delay a query → bound scans, coalesce identical reads,
  skip unreadable files, and return partial results.
- Codex JSONL formats may evolve → isolate parsing and tolerate unknown record types.
- A manual binding can conflict with automatic discovery → preserve existing claims unless validation
  succeeds; expose a rejected-binding reason.
- File-tree rerenders can grow with many changes → use immutable decoration maps and memoized node
  props; never enumerate unexpanded tree nodes.
- Remote path rules differ by host → use existing repository platform and path-normalization helpers
  rather than browser path assumptions.

## Migration Plan

1. Ship the contracts and service behind the normal local Codex session entry point without changing
   automatic recovery.
2. Enable the dialog only for eligible local or WSL Codex sessions; retain current UI behavior for
   every other provider and for remote worktrees.
3. Add file-tree decorations as a derived display layer; rollback consists of removing the FilePanel
   decoration input without altering Git state or file-tree persistence.
4. Validate focused unit and IPC tests, then run typecheck, lint, and affected Electron scenarios.
