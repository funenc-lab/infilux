# REPOSITORY COMPONENTS GUIDE

This directory owns repository-management dialogs and repository-specific settings surfaces.

This guide extends `src/renderer/components/AGENTS.md`.

## RESPONSIBILITIES

- Render repository management and repository settings flows
- Keep repository administration UI distinct from general layout or Git widgets

## RULES

- Repository metadata editing should use explicit store or IPC actions.
- Dialog state should stay localized and predictable.
- Preserve repository identity and path clarity in UI wording and validation.

## ANTI-PATTERNS

- Mixing repository administration with unrelated source-control panel logic
- Repeating repository validation in multiple dialogs without shared helpers
