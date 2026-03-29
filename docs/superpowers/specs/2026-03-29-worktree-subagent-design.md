# Worktree Subagent Visibility Design

## Goal
Show the current agent and its live subagents under each worktree, and route clicks into the existing raw terminal conversation surface.

## Chosen Approach
1. Reuse the existing chat terminal as the only conversation surface.
2. Add a provider-agnostic live-subagent model.
3. Implement the first provider adapter for Codex by parsing Codex local runtime logs.

## Why this approach
- It avoids building a second transcript renderer.
- It keeps session ownership inside the existing agent session store.
- It creates a clean extension point for future providers.

## Architecture
### Renderer
- Derive the current parent agent from the active session in each worktree.
- Poll a new IPC endpoint for live subagents grouped by worktree path.
- Render a compact agent/subagent stack inside worktree items.
- Clicking a parent or child switches to the chat tab and activates the parent session.

### Main process
- Add a Codex subagent tracker service.
- Incrementally parse `~/.codex/log/codex-tui.log`.
- Infer parent-child thread relationships from nested `session_loop{thread_id=...}` prefixes.
- Expose a serializable snapshot over IPC.

## Assumptions
- First release supports local Codex sessions only.
- A child click opens the parent raw terminal because the app does not own separate PTYs for Codex child threads.
- Live state is based on recent log activity rather than an explicit close event.

## Extension Points
- Add new provider parsers behind the same shared live-subagent contract.
- Replace polling with push notifications later if a provider supports streaming events.
- Attach a richer subagent transcript view later without changing worktree UI contracts.
