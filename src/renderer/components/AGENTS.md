# RENDERER COMPONENTS GUIDE

This directory contains React feature surfaces, shared UI composition, and panel-level components.

This guide extends `src/renderer/AGENTS.md`.

## RESPONSIBILITIES

- Compose feature views from stores, hooks, and UI primitives
- Keep domain-specific UI grouped by feature folder
- Reuse shared primitives from `ui/` and shared policies from hooks or lib helpers

## RULES

- Components should remain presentation-heavy and orchestration-light unless they are explicit panel entry points.
- Extract reusable behavior into hooks or pure helpers instead of copying large effect blocks.
- Preserve remote-aware and keep-mounted behavior where the feature requires it.
- Prefer one domain folder per feature surface over generic catch-all component buckets.

## ANTI-PATTERNS

- Hiding cross-panel business rules inside deeply nested presentational components
- Duplicating state normalization that belongs in hooks, stores, or policy helpers
- Creating new primitives before checking `components/ui/`
