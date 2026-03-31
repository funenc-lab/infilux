# GROUP COMPONENTS GUIDE

This directory owns group-management UI such as group creation, editing, selection, and move actions.

This guide extends `src/renderer/components/AGENTS.md`.

## RESPONSIBILITIES

- Render group editing flows and supporting selection UI
- Keep group-specific dialogs and menus together

## RULES

- Group naming, icon, and assignment flows should stay explicit and reusable.
- Dialog and submenu behavior should reuse shared UI primitives where possible.
- Avoid leaking repository-sidebar-specific assumptions into generic group components.

## ANTI-PATTERNS

- Spreading group-edit behavior across multiple unrelated directories
- Rebuilding shared menu or dialog primitives for one group action
