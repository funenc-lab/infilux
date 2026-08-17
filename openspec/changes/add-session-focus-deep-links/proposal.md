## Why

Infilux can open a repository path through its URL scheme, but external notifications and automation
cannot focus a specific running agent session. Users must manually locate the worktree and session
after returning to the app.

## What Changes

- Extend the `infilux://` URL contract with a validated session-focus target.
- Route valid targets through the main process to the renderer, where existing worktree and session
  selection state performs the focus operation.
- Preserve path-only deep links and reject malformed, unknown, remote-mismatched, or stale targets
  without changing the current UI selection.

## Capabilities

### New Capabilities

- `session-focus-deep-links`: Focus an eligible Infilux agent session from a validated application
  URL in cold-start, second-instance, and running-application flows.

### Modified Capabilities

- None.

## Impact

- **Main process:** URL parsing, pending action lifecycle, and second-instance forwarding.
- **Preload and shared contracts:** explicit focus request event payload.
- **Renderer:** worktree switch and existing agent-session selection coordination.
- **Acceptance criteria:** valid links focus the intended session; invalid links preserve state;
  path-only links remain backward compatible on macOS, Windows, and Linux.
