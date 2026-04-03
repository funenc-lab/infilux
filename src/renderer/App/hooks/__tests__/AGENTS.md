# APP HOOKS TESTS GUIDE

This directory contains tests for shell-level hooks that coordinate worktree selection, app lifecycle, and panel behavior.

This guide extends `src/renderer/App/hooks/AGENTS.md`.

## RESPONSIBILITIES

- Verify shell-scoped hook side effects, cleanup, and store coordination
- Cover startup, settings sync, worktree, and lifecycle flows through observable outcomes
- Keep shell hook tests readable despite multi-store orchestration

## RULES

- Use explicit store fixtures, query clients, and bridge mocks per test.
- Assert subscriptions, cleanup, and cross-store writes when the hook owns them.
- Prefer focused hook-specific fixtures over one giant app-shell harness.

## ANTI-PATTERNS

- Testing hook internals instead of observable behavior
- Sharing mutable store state between unrelated cases
- Hiding cleanup expectations behind generic render-hook helpers
