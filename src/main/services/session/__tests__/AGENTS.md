# SESSION SERVICES TESTS GUIDE

This directory contains tests for session identity, persistence, attach flows, and recovery behavior.

This guide extends `src/main/services/session/AGENTS.md`.

## RESPONSIBILITIES

- Verify session creation, restoration, replay, and window attachment behavior
- Cover persistence and host-backed recovery without collapsing into PTY transport tests
- Keep cleanup aligned with session, terminal, and remote boundaries

## RULES

- Use explicit fake hosts, repositories, and persistence layers when possible.
- Assert attach, detach, replay, and recovery behavior as observable session outcomes.
- Cover cleanup and teardown paths whenever session state owns resources or host attachments.

## ANTI-PATTERNS

- Using real PTY behavior as a substitute for session coverage
- Hiding persistence assumptions in opaque fixtures
- Duplicating remote reconnect coverage that belongs in remote service tests
