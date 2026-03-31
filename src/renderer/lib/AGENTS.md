# RENDERER LIB GUIDE

This directory contains pure or mostly pure renderer utilities, models, and helper policies that are shared across renderer features.

This guide extends `src/renderer/AGENTS.md`.

## RESPONSIBILITIES

- Host renderer-only helpers that are not React hooks and not shared cross-process utilities
- Keep derivation logic, theme helpers, copy builders, and diagnostics helpers reusable
- Provide narrow helper modules with obvious ownership

## RULES

- Prefer pure functions and explicit inputs.
- If a helper becomes process-agnostic, move it to `src/shared/`.
- If a helper becomes feature-specific, move it closer to that feature.
- Avoid hidden reads from stores or globals unless the module name makes that dependency obvious.

## ANTI-PATTERNS

- Turning `lib/` into an unowned dumping ground
- Keeping renderer-specific policies here when they belong in one feature folder
- Mixing Electron bridge calls into functions that appear pure
