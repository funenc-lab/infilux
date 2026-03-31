# SETTINGS SERVICES GUIDE

This directory owns main-process settings-side compatibility helpers such as legacy import behavior.

This guide extends `src/main/services/AGENTS.md`.

## RESPONSIBILITIES

- Support settings migration or import flows that must run in main
- Keep compatibility-only logic isolated from renderer store implementation

## RULES

- Compatibility code should stay narrow, explicit, and well-scoped.
- Document why a legacy path still exists when adding new compatibility logic.
- Avoid turning this directory into a second settings system.

## ANTI-PATTERNS

- Reimplementing renderer settings ownership in main
- Letting one-off migration logic leak into normal runtime paths
