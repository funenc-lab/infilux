# LAYOUT COMPONENTS GUIDE

This directory owns the shell layout, sidebars, deferred panel loading, and main content composition.

This guide extends `src/renderer/components/AGENTS.md`.

## RESPONSIBILITIES

- Compose the visible shell around worktrees, sidebars, panels, and overlays
- Manage deferred panel wrappers and keep-mounted layout behavior
- Host layout-specific policies for retention, prefetching, and render planning

## ASSUMPTIONS

- Hidden panels often remain mounted and continue holding runtime state.
- Layout-level code may coordinate visibility and composition, but feature ownership still belongs to stores, hooks, or feature folders.

## RULES

- Layout code may decide what is visible, but should not own feature state.
- Deferred wrappers should stay thin and predictable.
- Panel retention and prefetch policies should live in explicit helper modules.
- Preserve keyboard, focus, and truncation behavior across narrow layouts.
- Keep shell-level derivation in named policy/model helpers instead of embedding it in render branches.
- Make cross-panel visibility rules explicit when they affect startup, retention, or deferred loading behavior.
- Preserve worktree, repository, and temporary-workspace context clarity in row and panel composition.

## HOTSPOTS

- `MainContent.tsx`
- `TreeSidebar.tsx`
- `RepositorySidebar.tsx`
- `WorktreePanel.tsx`
- `panelRetentionPolicy.ts`
- `mainContentMountPolicy.ts`
- `treeSidebarRepoSnapshot.ts`

## EXTENSION POINTS

- Add new retention, prefetch, or render-order decisions as focused policy modules in this directory.
- Keep row-level display rules in the leaf sidebar/worktree subdirectories when they do not affect shell orchestration.
- Add layout-only helpers for focus restoration, panel planning, or snapshot derivation before extending shared primitives.

## TESTING FOCUS

- Verify keep-mounted assumptions, panel retention, and deferred rendering boundaries.
- Assert keyboard navigation, focus handling, and narrow-layout truncation behavior where layout code coordinates them.
- Cover visibility decisions through public component behavior instead of helper implementation details.

## ANTI-PATTERNS

- Embedding feature business logic in layout wrappers
- Assuming hidden panels unmount
- Repeating panel-retention policy in multiple components
- Letting several layout leaves mutate the same cross-panel concern independently
