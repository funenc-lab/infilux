# WORKTREE PANEL LEAF GUIDE

This directory contains leaf row components used by the worktree panel.

This guide extends `src/renderer/components/layout/AGENTS.md`.

## RESPONSIBILITIES

- Render individual worktree rows or cards used by the panel
- Keep row-level interaction details isolated from panel orchestration

## RULES

- Components here should stay focused on one worktree item at a time.
- Summary or snapshot derivation belongs outside the row when it is reused.
- Preserve clear destructive-action affordances and branch/path context.

## ANTI-PATTERNS

- Mixing panel data-loading concerns into a row component
- Reimplementing shared worktree presentation rules in multiple places
