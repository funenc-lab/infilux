# SESSION HOSTS GUIDE

This directory owns host-specific session backends such as tmux and supervisor adapters.

This guide extends `src/main/services/session/AGENTS.md`.

## RESPONSIBILITIES

- Encapsulate host-specific session lifecycle operations
- Present a stable host abstraction to higher-level session services
- Keep tmux and supervisor behavior isolated behind clear adapters

## RULES

- Host adapters should normalize attach, create, list, and teardown behavior into consistent results.
- Platform-specific quirks must stay local to the host implementation.
- Higher-level session services should not need to understand backend-specific command details.

## ANTI-PATTERNS

- Letting host adapters leak raw CLI output upward
- Duplicating persistence or renderer-facing logic inside host implementations
