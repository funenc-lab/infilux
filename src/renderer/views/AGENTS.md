# RENDERER VIEWS GUIDE

This directory contains view-level renderer surfaces that sit above leaf components but below the full app shell.

This guide extends `src/renderer/AGENTS.md`.

## RESPONSIBILITIES

- Host view-oriented composition that does not fit feature component folders
- Keep view entry points distinct from low-level reusable components

## RULES

- View modules may compose feature components, but should avoid becoming a second app shell.
- Keep route or entry-level concerns explicit and easy to discover.
- Push reusable pieces down into `components/` when they stop being view-specific.

## ANTI-PATTERNS

- Duplicating app-shell orchestration inside one view
- Leaving reusable components stranded here after the feature grows
