# SESSION SERVICES GUIDE

This directory owns session identity, attach and detach flows, persistence, and runtime-state coordination.

This guide extends `src/main/services/AGENTS.md`.

## RESPONSIBILITIES

- Create and restore local or remote sessions
- Track attached windows, replay buffers, and runtime state
- Coordinate session persistence and host-specific recovery behavior

## BOUNDARY RULES

- Session services own session identity and lifecycle.
- PTY creation, resize, IO, and teardown stay in `terminal/`.
- Agent metadata and subagent tracking stay in `agent/`.
- Remote connection transport remains in `remote/`.

## RULES

- Preserve replay and recovery behavior during attach flows.
- Keep window attachment bookkeeping explicit.
- Make runtime-state transitions observable and serializable.
- Cleanup must stay aligned with PTY and remote connection teardown paths.

## ANTI-PATTERNS

- Letting session classes become thin wrappers over PTY logic
- Hiding persistence side effects in helper functions with unclear ownership
- Duplicating remote reconnect behavior that should stay in `remote/`
