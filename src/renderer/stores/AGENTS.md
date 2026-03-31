# RENDERER STORES GUIDE

This directory owns Zustand stores and renderer state boundaries.

This guide extends `src/renderer/AGENTS.md`.

## RESPONSIBILITIES

- Define durable renderer state ownership
- Expose explicit actions for editor, worktree, terminal, session, and feature UI state
- Keep store boundaries aligned with real domain ownership

## RULES

- Before adding state, confirm no existing store already owns the concern.
- Stores should expose explicit actions rather than relying on consumers mutating derived structures.
- Persisted state, ephemeral state, and runtime-only state should remain distinguishable.
- Cross-store coordination is acceptable, but ownership must stay clear.

## HOTSPOTS

- `editor.ts`
- `worktree.ts`
- `worktreeActivity.ts`
- `agentSessions.ts`
- `settings/`

## ANTI-PATTERNS

- Creating a parallel source of truth for convenience
- Storing UI-only derivations that should be computed in selectors or helpers
- Letting one store reach into many unrelated domains until boundaries disappear
