# FILE SERVICES TESTS GUIDE

This directory contains tests for main-process file access and watcher services.

This guide extends `src/main/services/files/AGENTS.md`.

## RESPONSIBILITIES

- Verify safe file access, watcher setup, and teardown behavior
- Cover local and remote-aware file assumptions where the service boundary requires them

## RULES

- Use temporary filesystems and explicit watcher fixtures.
- Assert deterministic teardown for watchers and subscriptions.

## ANTI-PATTERNS

- Leaving filesystem watchers alive after test completion
- Assuming local-only behavior in shared file-service coverage
