# RENDERER HOOKS GUIDE

This directory contains reusable renderer behavior units for file trees, terminals, git flows, worktrees, and other async orchestration.

This guide extends `src/renderer/AGENTS.md`.

## RESPONSIBILITIES

- Encapsulate side effects, subscriptions, and cross-component behavior
- Keep complex renderer orchestration out of presentational components
- Host feature-specific policies when a hook needs nearby helpers

## QUERY AND STORE BOUNDARIES

- React Query owns fetch lifecycle, caching, invalidation, and mutation status where it is already in use.
- Zustand stores own durable UI/application state, not transient query status that can stay in the query layer.
- Hooks may compose queries, stores, and preload APIs, but should keep ownership boundaries obvious.

## RULES

- Hooks should expose clear inputs and outputs, not hidden coupling through module globals.
- Extract pure policy helpers when a hook becomes branch-heavy.
- Cleanup paths must be explicit for watchers, subscriptions, and timers.
- Prefer extending an existing hook when the ownership is already correct.
- Keep query keys, invalidation, and optimistic-update behavior explicit when a hook coordinates React Query.
- Name hooks after the behavior they own, not after an incidental implementation detail.
- Avoid hiding broad cross-store writes behind generic hook calls with unclear side effects.

## HOTSPOTS

- `useFileTree.ts`
- `useXterm.ts`
- `useRepositoryRuntimeContext.ts`

## EXTENSION POINTS

- Add pure policy helpers alongside a hook when branching logic or data shaping grows.
- Extract shared subscription or cleanup helpers when multiple hooks coordinate the same resource pattern.
- Add dedicated test helpers for timers, query clients, and bridge subscriptions instead of ad hoc mocks in each suite.

## TESTING FOCUS

- Verify cleanup for subscriptions, timers, and window-scoped listeners.
- Assert observable store writes, query invalidation, and bridge interactions rather than internal implementation steps.
- Cover local and remote-aware behavior separately when a hook supports both modes.

## ANTI-PATTERNS

- Creating overlapping hooks that own the same concern differently
- Hiding store writes behind generic hook names
- Mixing JSX rendering into behavior hooks
- Mutating query cache or store state without clear ownership of the affected key or slice
