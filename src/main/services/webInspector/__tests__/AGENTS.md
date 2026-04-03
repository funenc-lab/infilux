# WEB INSPECTOR SERVICES TESTS GUIDE

This directory contains tests for web inspector backend lifecycle and diagnostics behavior.

This guide extends `src/main/services/webInspector/AGENTS.md`.

## RESPONSIBILITIES

- Verify server enablement, startup, shutdown, and diagnostics behavior
- Keep network-facing behavior explicit and easy to reason about in tests

## RULES

- Use controlled server fixtures and fake diagnostics inputs where possible.
- Assert idempotent start/stop and cleanup behavior explicitly.

## ANTI-PATTERNS

- Treating the inspector backend as unmanaged process state
- Leaving ports or background resources alive after a test completes
