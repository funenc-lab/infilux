# SHARED MODULE TESTS GUIDE

This directory contains tests for cross-process shared modules and contracts.

This guide extends `src/shared/AGENTS.md`.

## RESPONSIBILITIES

- Verify shared behavior remains process-agnostic and stable across consumers
- Catch contract drift in shared branding, i18n, path, or type-adjacent modules
- Keep tests safe to run without Electron, DOM-only, or main-only runtime assumptions

## RULES

- Prefer deterministic, runtime-agnostic fixtures.
- Assert public shared behavior, not process-specific implementation details.
- Keep dependency direction expectations visible when testing shared modules.

## ANTI-PATTERNS

- Importing main- or renderer-only modules into shared tests without necessity
- Depending on Electron globals in shared coverage
- Hiding cross-process assumptions inside opaque fixtures
