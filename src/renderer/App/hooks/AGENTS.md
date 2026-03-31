# APP HOOKS GUIDE

This directory contains shell-level hooks for worktree selection, app lifecycle, panel state, and other cross-feature orchestration.

This guide extends `src/renderer/App/AGENTS.md`.

## RESPONSIBILITIES

- Encapsulate app-shell side effects behind focused hooks
- Coordinate store interactions for startup, settings sync, worktree flows, and app lifecycle
- Keep large orchestration readable by extracting stable behavioral units

## RULES

- Hooks here may compose multiple stores and Electron bridge calls when the behavior is shell-scoped.
- Extract pure policy and model helpers when a hook grows branch-heavy.
- Keep effect cleanup and subscription teardown explicit.
- Avoid turning one hook into the only place that understands unrelated feature rules.

## ANTI-PATTERNS

- Repeating the same store coordination across multiple shell hooks
- Hiding panel routing state in local hook state when a store already owns it
- Mixing presentation markup into orchestration hooks
