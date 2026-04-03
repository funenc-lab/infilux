# SETTINGS SERVICES TESTS GUIDE

This directory contains tests for main-process settings compatibility helpers.

This guide extends `src/main/services/settings/AGENTS.md`.

## RESPONSIBILITIES

- Verify compatibility-only settings import or migration behavior
- Keep legacy-path coverage isolated from normal renderer settings ownership

## RULES

- Use explicit legacy payload fixtures.
- Assert why compatibility behavior exists through targeted, scoped cases.

## ANTI-PATTERNS

- Turning compatibility tests into a second settings-system suite
- Hiding legacy assumptions in ambient environment state
