# IPC TESTS GUIDE

This directory contains tests for main-process IPC handlers and sender-scoped lifecycle behavior.

This guide extends `src/main/ipc/AGENTS.md`.

## RESPONSIBILITIES

- Verify handler payload shaping, delegation boundaries, and serializable responses
- Cover sender-scoped subscription setup and teardown behavior
- Keep cross-layer contract drift visible when IPC behavior changes

## RULES

- Prefer behavior tests at the handler boundary instead of testing private helper branches directly.
- Mock service dependencies narrowly and assert delegation inputs explicitly.
- Cover teardown paths when a handler owns listeners, watchers, or sender-bound resources.
- Assert stable payload contracts rather than broad snapshots of incidental object shape.

## ANTI-PATTERNS

- Reimplementing service logic inside IPC tests
- Forgetting to verify cleanup for sender-scoped listeners
- Coupling tests to refactors that do not change handler behavior
