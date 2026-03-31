# SETTINGS STORE GUIDE

This directory owns settings defaults, types, migration, persistence, runtime hydration, and settings-specific normalization rules.

This guide extends `src/renderer/stores/AGENTS.md`.

## RESPONSIBILITIES

- Define the settings schema and defaults
- Manage migration and persistence behavior
- Normalize runtime-derived settings behavior such as hydration and terminal scrollback policy

## RULES

- Schema changes must update defaults, types, migration, and storage expectations together.
- Normalization logic belongs close to the setting that needs it.
- Keep runtime hydration concerns explicit and testable.
- Preserve compatibility with the stable `stores/settings.ts` entry point.

## ANTI-PATTERNS

- Adding settings fields without migration or default coverage
- Putting UI labels or section composition logic into the settings store
- Smuggling unrelated feature state into persisted settings
