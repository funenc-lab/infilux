## Why

Infilux exposes commit history and diffs but does not visually show branch topology, merge parents, or
ahead/behind context. Multi-worktree users need a compact graph to reason about branch relationships
without leaving Source Control.

## What Changes

- Add structured commit graph rows and lane transitions to the Git history contract.
- Render an accessible, token-aligned graph beside commit history entries.
- Represent incoming and outgoing comparison markers distinctly from persisted commits.
- Preserve existing commit selection, history pagination, diff viewing, and remote repository support.

## Capabilities

### New Capabilities

- `commit-history-graph`: Present repository commit topology and comparison markers in Source Control
  using stable structured history data.

### Modified Capabilities

- None.

## Impact

- **Main process:** Git log shaping and graph lane calculation.
- **Shared contracts:** serializable graph row and reference metadata.
- **Renderer:** Source Control history presentation and keyboard-accessible commit selection.
- **Repositories:** local and remote repositories when their existing Git history endpoint is available.
- **Acceptance criteria:** linear, branch, merge, and comparison histories render deterministically
  without changing existing diff or commit actions.
