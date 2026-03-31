# RENDERER HOOKS GUIDE

This directory contains reusable renderer behavior units for file trees, terminals, git flows, worktrees, and other async orchestration.

This guide extends `src/renderer/AGENTS.md`.

## RESPONSIBILITIES

- Encapsulate side effects, subscriptions, and cross-component behavior
- Keep complex renderer orchestration out of presentational components
- Host feature-specific policies when a hook needs nearby helpers

## RULES

- Hooks should expose clear inputs and outputs, not hidden coupling through module globals.
- Extract pure policy helpers when a hook becomes branch-heavy.
- Cleanup paths must be explicit for watchers, subscriptions, and timers.
- Prefer extending an existing hook when the ownership is already correct.

## HOTSPOTS

- `useFileTree.ts`
- `useXterm.ts`
- `useRepositoryRuntimeContext.ts`

## ANTI-PATTERNS

- Creating overlapping hooks that own the same concern differently
- Hiding store writes behind generic hook names
- Mixing JSX rendering into behavior hooks
