# LAYOUT COMPONENTS TESTS GUIDE

This directory contains tests for shell layout, sidebars, deferred panels, and panel-retention behavior.

This guide extends `src/renderer/components/layout/AGENTS.md`.

## RESPONSIBILITIES

- Verify keep-mounted behavior, deferred rendering, and shell composition decisions
- Cover sidebar, panel-retention, and render-planning behavior through public UI outcomes
- Keep feature business logic out of layout test expectations

## RULES

- Assert visibility, retention, focus, and keyboard behavior rather than helper implementation details.
- Use explicit fixtures for panel state, worktree context, and shell-level stores.
- Cover narrow-layout and truncation-sensitive behavior when layout code coordinates it.

## ANTI-PATTERNS

- Assuming hidden panels unmount in tests
- Revalidating feature internals that belong to child component suites
- Depending on incidental deferred-wrapper markup
