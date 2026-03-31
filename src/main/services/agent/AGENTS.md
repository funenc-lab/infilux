# AGENT SERVICES GUIDE

This directory owns agent metadata, subagent tracking, and agent-specific transcript or status coordination.

This guide extends `src/main/services/AGENTS.md`.

## RESPONSIBILITIES

- Define available agent metadata and capabilities
- Track subagent relationships and transcript-related state
- Keep agent identity and registry logic separate from terminal transport

## RULES

- Agent definitions should use shared types from `@shared/types`.
- Trackers should record explicit state transitions and timestamps.
- Transcript utilities should preserve ordering and avoid mixing persistence with UI formatting.
- Do not move PTY creation, session attach logic, or window routing into this directory.

## ANTI-PATTERNS

- Treating agent runtime state as terminal state
- Embedding UI copy or renderer-specific presentation logic in agent services
- Duplicating session lifecycle logic that already belongs to `session/`
