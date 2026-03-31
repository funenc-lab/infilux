# APP COMPONENTS GUIDE

This directory contains small app-level renderer components that do not fit a larger feature folder.

This guide extends `src/renderer/components/AGENTS.md`.

## RESPONSIBILITIES

- Host narrowly scoped app-wide widgets or menus
- Keep app-level presentation helpers out of unrelated feature domains

## RULES

- Components here should stay small and app-scoped.
- If a component grows feature-specific behavior, move it into that feature directory.
- Keep Electron bridge usage indirect through stores or hooks when possible.

## ANTI-PATTERNS

- Letting this folder become a miscellaneous fallback for any component
- Mixing repository, terminal, or settings business rules into app-level widgets
