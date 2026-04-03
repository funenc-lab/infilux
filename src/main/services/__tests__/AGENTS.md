# MAIN SERVICES TESTS GUIDE

This directory contains tests for shared main-process service helpers and service-level coordination.

This guide extends `src/main/services/AGENTS.md`.

## RESPONSIBILITIES

- Verify service boundaries, normalized outputs, and lifecycle-sensitive behavior
- Keep privileged side effects testable through explicit fakes, fixtures, or temporary resources
- Catch cleanup regressions before they escape into IPC or window-level flows

## RULES

- Prefer black-box tests around public service methods and explicit collaborators.
- Use temporary directories, fake processes, and scoped fixtures instead of real user state.
- Assert cleanup, shutdown, or disposal behavior when a service owns resources.
- Keep renderer-facing formatting expectations out of service tests unless the contract explicitly requires them.

## ANTI-PATTERNS

- Depending on ambient machine state or installed apps
- Asserting renderer-shaped presentation data from domain services
- Leaving background resources alive after a test completes
