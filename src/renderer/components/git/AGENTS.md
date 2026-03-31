# GIT COMPONENTS GUIDE

This directory owns Git-focused UI such as repository add flows, branch selection, commit forms, and sync status widgets.

This guide extends `src/renderer/components/AGENTS.md`.

## RESPONSIBILITIES

- Render Git acquisition, branch, history, commit, and sync surfaces
- Keep Git-specific UI separate from source-control diff panel composition

## RULES

- Prefer shared git hooks or store actions for data loading and mutations.
- Keep branch, clone, commit, and sync concerns modular.
- Use clear loading and error states for long-running Git operations.

## ANTI-PATTERNS

- Embedding raw Git command logic in components
- Duplicating repository selection or sync state derivation across widgets
