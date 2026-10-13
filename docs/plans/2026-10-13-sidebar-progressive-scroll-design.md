# Stable Progressive Sidebar Loading

## Approved scope

- Keep progressive repository loading and automatic loading while scrolling down.
- Remove visible "Load more" and remaining-count text; retain an icon-only, keyboard-accessible fallback.
- Keep existing repository rows, expansion, selection, and viewport position stable while loading or selecting repositories.
- Do not change repository removal semantics, filesystem paths, sessions, or terminals.

## Evidence

`useProgressiveRepositoryVisibility` currently resets pagination whenever repository inventory changes. Its visibility policy promotes the selected repository and sorts visible rows again when access timestamps change. `TreeSidebar` also includes every repository path in grouped pagination's reset key. `RepositoryLoadMoreButton` watches the entire scroll container's bottom rather than its own position, and does not preserve the viewport when new rows move a focused fallback button.

## Design

1. Separate visibility-scope resets from repository inventory updates. Keep previously displayed paths in their display order within the current scope, prefer those paths when allocating the inactive budget, and append newly revealed rows. Compare the common inventory paths' relative order to honor explicit drag reordering without treating additions or removals as a reset. Continue showing selected/active repositories and reset on actual group/search changes.
2. Preserve each existing group's loaded budget when inventories or other groups change. Prune removed groups without resetting surviving groups. Use the active group, not all repository paths, as the caller's reset key.
3. Reuse the existing loading component as an icon-only fallback with an accessible name. Trigger automatic loading only for a visible loading control while scrolling down. Capture a visible directory row and its viewport offset, preferring a visible active worktree or selected repository. Compensate that row's displacement before paint, including when grouping inserts new rows above it. Fall back to the absolute scroll offset only when no row anchor survives.
4. When anchoring leaves the viewport at the new bottom, accept a new downward wheel input as another explicit loading intent. Do not load another batch solely because the anchor adjustment generated a scroll event. Ignore upward, zoom, and horizontal-modifier wheel input.

No new store, IPC, palette, or primitive is needed. Existing local and remote paths remain normalized through the same shared path policy.

## Verification

- Regressions for stable row order, retained loaded budgets after inventory updates, explicit manual reordering, independent group pagination, and genuine scope resets.
- Regressions for no visible loading text, automatic loading near the correct group, no repeat loading at a stationary/upward position, renewed downward wheel input at the anchored bottom, preserved row offsets after grouped insertion, and fallback scroll offsets including the final batch.
- Targeted layout tests, TypeScript, scoped formatting/lint checks, and a real-browser viewport check with synthetic repositories if the browser runtime is available.
