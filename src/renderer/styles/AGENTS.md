# RENDERER STYLES GUIDE

This directory contains global renderer stylesheet entry points and style-layer composition.

This guide extends `src/renderer/AGENTS.md`.

## RESPONSIBILITIES

- Host global CSS that should not live inside component modules
- Define shared style-layer defaults that support the design system

## RULES

- Keep global CSS minimal and intentional.
- Prefer tokens and semantic classes over ad hoc hardcoded values.
- Component-specific styling should stay near the component unless it truly belongs in the global layer.

## ANTI-PATTERNS

- Moving feature-specific CSS into global styles for convenience
- Reintroducing one-off visual values that bypass token governance
