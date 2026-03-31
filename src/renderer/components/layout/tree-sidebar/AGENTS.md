# TREE SIDEBAR GUIDE

This directory contains leaf components for worktree and temporary-workspace rows in the tree sidebar.

This guide extends `src/renderer/components/layout/AGENTS.md`.

## RESPONSIBILITIES

- Render tree-sidebar row variants for worktrees and temporary workspaces
- Keep row-level presentation isolated from sidebar orchestration

## RULES

- Row components should make selection, status, and path context obvious.
- Shared sidebar state and snapshot logic belong in the parent layout directory.
- Keep keyboard, truncation, and dense-list behavior consistent across row variants.

## ANTI-PATTERNS

- Duplicating tree selection logic in each row component
- Hiding worktree or temp-workspace identity behind ambiguous labels
