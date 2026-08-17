## Why

Infilux can restore persisted agent sessions, but users cannot browse prior Codex conversations,
inspect their identity, or deliberately bind a recovered conversation to the current local worktree.
The file tree also lacks the Git status context already available in Source Control, forcing users to
switch panels to understand which files and directories changed.

This change closes both workflow gaps without creating a second session or Git state source.

## What Changes

- Add a local Codex session history capability that indexes recent local and WSL Codex session
  metadata, lists sessions by worktree, and reads bounded conversation history on demand.
- Add an explicit renderer flow to inspect a historical Codex session and bind an eligible local
  session to the active Infilux agent session.
- Add worktree-aware Git status decorations for files and directories in the file tree by consuming
  the existing Source Control change state.
- Define deterministic status precedence for staged, unstaged, untracked, deleted, renamed, and
  conflicted files and their parent directories.
- Keep remote session history out of scope for this change; remote sessions must remain unchanged
  and the history UI must not expose a local Codex session as a remote recovery candidate.
- Apply file-tree Git decorations to both local and remote worktrees when their existing Source
  Control state is available.

## Capabilities

### New Capabilities

- `codex-session-history`: Browse bounded local or WSL Codex session history and safely bind an
  eligible historical session to the active local worktree session.
- `file-tree-git-status`: Show consistent Git status decorations for files and directories in local
  and remote file trees from the existing Source Control change state.

### Modified Capabilities

- None.

## Impact

- **Main process:** New Codex history service and typed IPC handlers; existing session and agent
  services remain the authority for session identity and persistence.
- **Preload and shared contracts:** New serializable history query/result types and bridge methods.
- **Renderer:** Chat session controls gain a history browser and binding action; FileTree consumes a
  derived decoration model without starting Git polling.
- **Local repositories:** Full Codex history behavior for native and WSL session roots.
- **Remote repositories:** File-tree decorations are supported; Codex history is unavailable by
  design and must not affect remote session recovery.
- **Risks:** Large session directories, stale or malformed JSONL files, WSL path normalization,
  case-insensitive file systems, and status updates during worktree switches.
- **Acceptance criteria:** History indexing never blocks startup, history results are scoped to the
  requested worktree, invalid sessions cannot be bound, file and directory decorations match Source
  Control after every refresh, and no additional Git polling or remote-path regressions are added.
