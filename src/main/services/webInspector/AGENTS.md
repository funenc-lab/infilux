# WEB INSPECTOR SERVICES GUIDE

This directory owns the backend server and service logic for the web inspector feature.

This guide extends `src/main/services/AGENTS.md`.

## RESPONSIBILITIES

- Start and stop the inspector backend cleanly
- Expose explicit control points for enablement, diagnostics, and status
- Keep server lifecycle aligned with app lifecycle and settings changes

## RULES

- Server startup and shutdown paths must be idempotent.
- Keep network-facing behavior explicit and easy to diagnose.
- Return structured diagnostics instead of raw log fragments when possible.
- Avoid mixing renderer-specific concerns into server lifecycle code.

## ANTI-PATTERNS

- Treating the inspector server as fire-and-forget process state
- Hiding port, host, or enablement decisions in unrelated modules
- Skipping cleanup when the feature is toggled or the app exits
