# RENDERER PROCESS TESTS GUIDE

This directory contains tests for renderer-wide behavior that does not fit a narrower feature suite.

This guide extends `src/renderer/AGENTS.md`.

## RESPONSIBILITIES

- Verify renderer-wide bootstrap, provider, or orchestration behavior at the right boundary
- Keep cross-feature renderer tests focused and explicit

## RULES

- Prefer targeted renderer boundary tests over broad app snapshots.
- Use explicit providers, stores, and query clients in setup.

## ANTI-PATTERNS

- Repeating feature-level suites at the renderer-root layer
- Depending on incidental tree structure instead of observable behavior
