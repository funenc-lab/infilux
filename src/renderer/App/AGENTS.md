# APP SHELL GUIDE

This directory owns renderer app-shell orchestration, startup policies, and cross-panel coordination helpers.

This guide extends `src/renderer/AGENTS.md`.

## RESPONSIBILITIES

- Coordinate startup overlays, app-wide policies, and panel persistence behavior
- Host shell-level hooks that span multiple feature panels
- Keep worktree switch and app lifecycle behavior explicit

## HOTSPOTS

- `useWorktreeSelection.ts`
- `useAppLifecycle.ts`
- startup and panel storage policy modules in this directory

## RULES

- App-shell code may orchestrate multiple stores, but should not become the source of truth for their state.
- Prefer pure policy modules for ordering, visibility, and persistence rules.
- Keep startup sequencing explicit so diagnostics and overlays stay debuggable.

## ANTI-PATTERNS

- Moving feature-specific state ownership into shell code for convenience
- Hiding lifecycle ordering in large effect blocks without extracted policy helpers
- Re-implementing per-panel logic instead of delegating to domain hooks or stores
