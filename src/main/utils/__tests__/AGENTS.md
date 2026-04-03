# MAIN UTILS TESTS GUIDE

This directory contains tests for main-process utility helpers.

This guide extends `src/main/utils/AGENTS.md`.

## RESPONSIBILITIES

- Verify deterministic utility behavior and clearly scoped side effects
- Keep process-specific helpers easy to reason about through focused tests
- Catch regressions in logging, shell, and runtime helper behavior

## RULES

- Prefer pure input/output assertions where possible.
- Isolate process, environment, or filesystem side effects behind explicit mocks or temporary fixtures.
- Keep tests small and responsibility-focused, matching the intended utility boundaries.

## ANTI-PATTERNS

- Treating utility tests as a dumping ground for unrelated business logic
- Depending on ambient environment variables without setting them explicitly
- Hiding irreversible side effects inside seemingly pure helper tests
