# APP SHELL TESTS GUIDE

This directory contains tests for renderer app-shell startup, panel persistence, and cross-panel coordination behavior.

This guide extends `src/renderer/App/AGENTS.md`.

## RESPONSIBILITIES

- Verify app-shell orchestration, startup sequencing, and panel-state behavior
- Cover worktree switch and app-lifecycle coordination at the shell boundary
- Keep feature-specific state ownership outside shell tests unless the shell behavior depends on it

## RULES

- Assert user-visible shell behavior instead of private effect ordering details.
- Use controlled stores, query clients, and bridge mocks with explicit setup.
- Cover keep-mounted and panel persistence behavior when shell logic coordinates it.

## ANTI-PATTERNS

- Duplicating feature-level tests at the app-shell layer
- Depending on incidental render tree structure
- Hiding lifecycle prerequisites in shared mutable test setup
