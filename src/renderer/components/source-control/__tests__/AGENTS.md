# SOURCE CONTROL COMPONENTS TESTS GUIDE

This directory contains tests for source-control panels, diffs, and commit-side UI behavior.

This guide extends `src/renderer/components/source-control/AGENTS.md`.

## RESPONSIBILITIES

- Verify change trees, diff behavior, commit flows, and source-control panel interactions
- Keep Git command execution details outside component-level coverage

## RULES

- Assert repository selection, diff visibility, and commit behavior through user-visible outcomes.
- Use explicit fixtures for changes, diffs, and repository state.

## ANTI-PATTERNS

- Testing raw Git command logic from a renderer component suite
- Duplicating the same diff behavior across multiple component snapshots
