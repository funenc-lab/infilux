# REMOTE SERVICES TESTS GUIDE

This directory contains tests for remote connection lifecycle, remote paths, and helper/runtime behavior.

This guide extends `src/main/services/remote/AGENTS.md`.

## RESPONSIBILITIES

- Verify connection-state transitions, host verification, and remote-path behavior
- Cover helper/runtime preparation through explicit fakes and fixtures

## RULES

- Keep local-path and remote-path scenarios distinct in tests.
- Assert reconnect, auth, and cleanup behavior through observable state transitions.

## ANTI-PATTERNS

- Treating remote mode as a small variation of local-only tests
- Requiring real remote hosts for routine coverage
