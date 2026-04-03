# HAPI SERVICES TESTS GUIDE

This directory contains tests for Hapi runtime managers, startup ordering, and tunnel coordination.

This guide extends `src/main/services/hapi/AGENTS.md`.

## RESPONSIBILITIES

- Verify startup, shutdown, and health-reporting behavior for Hapi-related managers
- Cover tunnel/process coordination with controlled fakes
- Keep lifecycle ordering explicit and observable in tests

## RULES

- Use fake process adapters and scoped port fixtures where possible.
- Assert startup dependencies and shutdown ordering explicitly.
- Cover failure and recovery paths, not only the happy path.

## ANTI-PATTERNS

- Treating background processes as unmanaged test side effects
- Requiring live cloud or tunnel services for routine coverage
- Leaving ports or child processes open after test completion
