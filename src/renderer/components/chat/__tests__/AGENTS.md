# CHAT COMPONENTS TESTS GUIDE

This directory contains tests for the agent panel, chat-side session UI, and related chat policies.

This guide extends `src/renderer/components/chat/AGENTS.md`.

## RESPONSIBILITIES

- Verify session grouping, mount behavior, availability states, and chat-specific UI flows
- Cover temporary-workspace and remote-aware chat behavior where the feature supports it
- Keep PTY transport and persistence assumptions out of component-level coverage

## RULES

- Assert user-visible panel behavior, labels, and transitions rather than JSX structure.
- Use explicit store and query fixtures for session, settings, and availability state.
- Cover empty, loading, rollover, and recovery states when the panel logic owns them.

## ANTI-PATTERNS

- Treating PTY process behavior as chat component coverage
- Snapshotting large chat trees instead of asserting targeted behavior
- Recreating agent-session ownership outside the supported stores
