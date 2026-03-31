# SOURCE CONTROL COMPONENTS GUIDE

This directory owns source-control panels, diff viewers, commit flows, and resize helpers for the source-control surface.

This guide extends `src/renderer/components/AGENTS.md`.

## RESPONSIBILITIES

- Render repository lists, change trees, diffs, commit workflows, and review modals
- Coordinate source-control UI with git-backed hooks and renderer stores
- Keep source-control specific resize and action helpers scoped to this feature

## RULES

- Diff rendering and commit orchestration should stay modular.
- Keep repository selection and commit action flows explicit.
- Reuse hooks or pure helpers for resize, action derivation, and diff-specific policies.
- Preserve remote-aware repository behavior where the underlying hooks support it.

## ANTI-PATTERNS

- Mixing Git command logic directly into components
- Duplicating diff or commit action logic between panels and dialogs
- Letting source-control components own repository-wide state that belongs in stores
