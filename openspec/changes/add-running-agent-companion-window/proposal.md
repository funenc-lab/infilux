## Why

The AI Center and chat canvas provide rich task views, but users monitoring several worktrees need a
compact always-available view of live agent work that can jump directly to the owning session.

## What Changes

- Add a dedicated optional companion window that displays a read-only projection of active agent
  sessions and task progress.
- Persist window bounds, support keyboard-safe navigation back to the main window, and clean up the
  window with application shutdown.
- Use a main-process projection sourced from existing session and task authorities; do not mirror or
  forward renderer Zustand state between windows.

## Capabilities

### New Capabilities

- `running-agent-companion-window`: Monitor active agent work from a secondary window and navigate
  to the selected main-window session safely.

### Modified Capabilities

- None.

## Impact

- **Main process:** window lifecycle, read-model projection, and sender-scoped subscriptions.
- **Preload and shared contracts:** typed snapshot and focus-navigation payloads.
- **Renderer:** a lightweight companion entry point plus existing session focus handling.
- **Acceptance criteria:** the companion never shows stale sessions after session removal, reopening
  restores bounds, and window closure does not retain listeners or prevent app shutdown.
