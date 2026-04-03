# UI PRIMITIVES TESTS GUIDE

This directory contains tests for shared renderer UI primitives.

This guide extends `src/renderer/components/ui/AGENTS.md`.

## RESPONSIBILITIES

- Verify accessibility, keyboard behavior, focus management, and stable primitive contracts
- Keep primitive behavior reusable and renderer-generic through focused tests
- Catch regressions in semantic props, disabled states, and composable APIs

## RULES

- Prefer behavioral assertions for keyboard, focus-visible, and ARIA semantics.
- Cover controlled and uncontrolled behavior when a primitive supports both.
- Keep token- or variant-related assertions scoped to stable public behavior.

## ANTI-PATTERNS

- Relying on brittle snapshots of generated markup
- Testing feature-specific workflows through shared primitives
- Ignoring accessibility behavior because styling appears correct
