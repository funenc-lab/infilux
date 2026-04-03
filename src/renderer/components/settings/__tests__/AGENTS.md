# SETTINGS COMPONENTS TESTS GUIDE

This directory contains tests for settings surfaces, settings-shell composition, and section-specific editor behavior.

This guide extends `src/renderer/components/settings/AGENTS.md`.

## RESPONSIBILITIES

- Verify save, discard, reset, preview, and section navigation behavior
- Cover settings sections that coordinate local draft state with persisted settings actions
- Keep storage and migration internals outside component-level tests

## RULES

- Assert user-visible settings behavior and section boundaries rather than broad structural snapshots.
- Use explicit store fixtures for persisted settings, draft state, and appearance models.
- Cover destructive or reset actions with clear confirmation and state-reset assertions.

## ANTI-PATTERNS

- Testing store migration logic from a component suite
- Hardcoding theme or token expectations that should come from stable models
- Coupling tests to implementation-only component nesting
