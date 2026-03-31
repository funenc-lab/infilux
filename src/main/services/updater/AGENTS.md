# UPDATER SERVICES GUIDE

This directory owns auto-update integration and updater lifecycle behavior.

This guide extends `src/main/services/AGENTS.md`.

## RESPONSIBILITIES

- Initialize updater behavior and status reporting
- Coordinate update checks, download state, and install readiness

## RULES

- Updater state changes should be explicit and observable.
- Keep platform-specific updater behavior isolated here.
- Do not mix settings UI or notification copy into updater service internals.

## ANTI-PATTERNS

- Treating updater side effects as fire-and-forget behavior
- Hiding install timing rules in unrelated lifecycle code
