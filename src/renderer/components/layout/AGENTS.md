# LAYOUT COMPONENTS GUIDE

This directory owns the shell layout, sidebars, deferred panel loading, and main content composition.

This guide extends `src/renderer/components/AGENTS.md`.

## RESPONSIBILITIES

- Compose the visible shell around worktrees, sidebars, panels, and overlays
- Manage deferred panel wrappers and keep-mounted layout behavior
- Host layout-specific policies for retention, prefetching, and render planning

## RULES

- Layout code may decide what is visible, but should not own feature state.
- Deferred wrappers should stay thin and predictable.
- Panel retention and prefetch policies should live in explicit helper modules.
- Preserve keyboard, focus, and truncation behavior across narrow layouts.

## HOTSPOTS

- `MainContent.tsx`
- `TreeSidebar.tsx`
- `RepositorySidebar.tsx`
- `WorktreePanel.tsx`

## ANTI-PATTERNS

- Embedding feature business logic in layout wrappers
- Assuming hidden panels unmount
- Repeating panel-retention policy in multiple components
