# SETTINGS STORE TESTS GUIDE

This directory contains tests for settings schema, defaults, migration, hydration, and persistence behavior.

This guide extends `src/renderer/stores/settings/AGENTS.md`.

## RESPONSIBILITIES

- Verify defaults, schema evolution, migration, and runtime hydration behavior
- Cover storage and normalization rules without relying on settings UI
- Keep compatibility with the stable `stores/settings.ts` surface visible

## RULES

- Update defaults, migration, runtime normalization, and storage coverage together when the schema changes.
- Use explicit persisted payload fixtures for compatibility and migration scenarios.
- Assert normalization behavior with focused inputs instead of broad end-to-end snapshots.

## ANTI-PATTERNS

- Adding a setting field without coverage for defaults or migration
- Treating UI labels as settings-store responsibilities
- Depending on ambient browser storage without explicit setup
