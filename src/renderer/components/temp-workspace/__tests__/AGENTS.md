# TEMP WORKSPACE COMPONENTS TESTS GUIDE

This directory contains tests for temporary-workspace UI behavior.

This guide extends `src/renderer/components/temp-workspace/AGENTS.md`.

## RESPONSIBILITIES

- Verify temporary-workspace menus, dialogs, and destructive/transient UX behavior
- Keep temp-workspace coverage distinct from normal repository and worktree flows

## RULES

- Assert clear temporary/disposable wording and action behavior.
- Use focused fixtures for temporary-workspace state and path labeling.

## ANTI-PATTERNS

- Reusing normal repository assumptions in temp-workspace tests
- Hiding destructive intent behind vague assertions
