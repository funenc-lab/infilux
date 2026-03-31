# TERMINAL COMPONENTS GUIDE

This directory owns terminal panel UI, terminal grouping, search, and resize interactions.

This guide extends `src/renderer/components/AGENTS.md`.

## RESPONSIBILITIES

- Render terminal groups, search UI, and panel chrome
- Coordinate xterm-backed UI with terminal hooks and stores
- Keep terminal-specific view models and presentation types local to this domain

## RULES

- Terminal transport and PTY lifecycle stay outside renderer components.
- Search and resize helpers should remain feature-scoped and reusable.
- Preserve keep-mounted behavior and resize coordination.
- Reuse `useXterm.ts` and terminal stores instead of creating side channels.

## ANTI-PATTERNS

- Treating renderer terminal components as the owner of terminal process state
- Repeating xterm wiring logic across multiple components
- Hiding terminal focus policy inside unrelated panels
