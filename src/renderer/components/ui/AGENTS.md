# UI PRIMITIVES GUIDE

This directory owns shared renderer UI primitives and low-level composition helpers.

This guide extends `src/renderer/components/AGENTS.md`.

## RESPONSIBILITIES

- Provide reusable UI building blocks for feature components
- Encapsulate accessibility, keyboard, focus, and styling behavior consistently
- Keep primitive APIs stable and composable

## RULES

- Add a new primitive only when existing ones cannot express the interaction cleanly.
- Prefer semantic props and composition over feature-specific variants.
- Accessibility and focus behavior are part of the primitive contract.
- Keep primitives renderer-generic; feature wording and business rules stay outside.

## ANTI-PATTERNS

- Building feature-specific abstractions into shared primitives
- Copying third-party examples without aligning them to project tokens and patterns
- Breaking primitive API consistency for one-off screens
