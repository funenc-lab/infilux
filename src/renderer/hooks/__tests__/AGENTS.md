# RENDERER HOOKS TESTS GUIDE

This directory contains tests for reusable renderer hooks and hook-adjacent policy helpers.

This guide extends `src/renderer/hooks/AGENTS.md`.

## RESPONSIBILITIES

- Verify hook side effects, cleanup, query invalidation, and store coordination
- Cover local and remote-aware behavior separately when the hook supports both
- Keep hook tests focused on observable outputs and owned side effects

## RULES

- Use explicit query clients, timers, stores, and bridge mocks per test case.
- Assert cleanup for subscriptions, listeners, and timers whenever the hook owns them.
- Prefer focused hook harnesses over one shared mega-fixture.

## ANTI-PATTERNS

- Hiding broad state mutation behind generic test helpers
- Leaving query cache, timers, or subscriptions dirty between tests
- Treating JSX rendering as hook-level coverage
