# GROUP COMPONENTS TESTS GUIDE

This directory contains tests for group-management UI behavior.

This guide extends `src/renderer/components/group/AGENTS.md`.

## RESPONSIBILITIES

- Verify group naming, selection, assignment, and dialog behavior
- Keep group-specific UI coverage isolated from sidebar orchestration

## RULES

- Assert user-visible group actions and validation behavior.
- Reuse shared menu and dialog helpers only when the component contract depends on them.

## ANTI-PATTERNS

- Spreading group behavior assertions across unrelated feature suites
- Testing generic menu primitives from a group feature suite
