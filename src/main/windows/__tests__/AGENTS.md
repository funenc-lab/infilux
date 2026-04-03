# WINDOW SERVICES TESTS GUIDE

This directory contains tests for BrowserWindow configuration and window-management behavior.

This guide extends `src/main/windows/AGENTS.md`.

## RESPONSIBILITIES

- Verify window creation defaults, lookup behavior, and lifecycle-sensitive hooks
- Keep BrowserWindow-specific behavior separate from app bootstrap concerns

## RULES

- Use explicit BrowserWindow fakes or adapters.
- Assert critical options and lifecycle hooks through observable behavior, not incidental implementation details.

## ANTI-PATTERNS

- Depending on a live renderer for simple window-manager coverage
- Duplicating app bootstrap tests inside window suites
