# TEMP WORKSPACE COMPONENTS GUIDE

This directory owns temporary-workspace dialogs and contextual actions.

This guide extends `src/renderer/components/AGENTS.md`.

## RESPONSIBILITIES

- Render temporary-workspace action menus and dialog flows
- Keep temporary-workspace UX separate from normal repository management

## RULES

- Temporary-workspace actions should remain explicit about destructive or transient behavior.
- Keep menu actions and dialogs aligned with temp-workspace store ownership.
- Preserve clear path and workspace labeling to avoid confusion with normal worktrees.

## ANTI-PATTERNS

- Reusing regular repository wording when the behavior is temporary or disposable
- Mixing temp-workspace creation rules into unrelated dialogs
