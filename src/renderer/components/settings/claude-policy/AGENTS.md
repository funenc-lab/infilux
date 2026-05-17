# CLAUDE POLICY SETTINGS GUIDE

This directory owns renderer settings UI for Claude capability, MCP, and native skill policy controls.

This guide extends `src/renderer/components/settings/AGENTS.md`.

## RESPONSIBILITIES

- Present global, project, and worktree policy controls for Claude capabilities and MCP access
- Keep policy draft models, preview data, source-path display, and batch actions scoped to this settings area
- Preserve clear inheritance semantics across allow, block, and inherit decisions

## RULES

- Keep policy persistence and file access behind existing settings, preload, and main-process policy bridges.
- Keep decision normalization, change detection, and batch updates in local model helpers.
- Preserve separation between capability, shared MCP, personal MCP, and native skill policy buckets.
- Keep global, project, and worktree scopes visually and behaviorally distinct.
- Treat source paths as display metadata; do not read or write files directly from renderer components.
- Use existing settings primitives and accessibility patterns for dense tables, segmented decisions, and batch controls.

## EXTENSION POINTS

- Add model helpers when a new policy bucket or scope affects multiple components.
- Add focused components for new policy sections before expanding a monolithic editor dialog.
- Extend preview logic when inheritance or source resolution gains new states.

## TESTING FOCUS

- Cover allow, block, inherit, batch actions, empty policy detection, and scope-specific source paths.
- Verify preview behavior for global, project, worktree, and legacy native skill policy cases.
- Test user-visible decision controls rather than private component state.

## ANTI-PATTERNS

- Collapsing global, project, and worktree policies into one ambiguous draft
- Writing policy files or scanning MCP sources directly from renderer components
- Mixing legacy native skill capability IDs with general capability policy without explicit filtering
- Repeating bucket update logic inside individual React components
