# UI PRIMITIVES GUIDE

This directory owns shared renderer UI primitives and low-level composition helpers.

This guide extends `src/renderer/components/AGENTS.md`.

## RESPONSIBILITIES

- Provide reusable UI building blocks for feature components
- Encapsulate accessibility, keyboard, focus, and styling behavior consistently
- Keep primitive APIs stable and composable

## OWNERSHIP RULES

- Shared primitives should solve reusable interaction or composition problems, not feature workflows.
- Visual tokens, keyboard semantics, and focus behavior are part of the primitive contract.
- Feature-specific labels, async side effects, and domain rules belong in feature folders, not here.

## RULES

- Add a new primitive only when existing ones cannot express the interaction cleanly.
- Prefer semantic props and composition over feature-specific variants.
- Accessibility and focus behavior are part of the primitive contract.
- Keep primitives renderer-generic; feature wording and business rules stay outside.
- Prefer stable controlled/uncontrolled APIs when component state can be externally managed.
- Keep variant names semantic and durable rather than screen-specific.
- Ensure pointer, keyboard, and focus-visible behavior stay aligned across interactive primitives.

## EXTENSION POINTS

- Add wrapper primitives only when they provide shared semantics, token integration, or accessibility behavior that several features need.
- Extract shared visual helpers when multiple primitives reuse the same motion, glow, or layout contract.
- Add focused test utilities for keyboard, focus, and ARIA assertions instead of duplicating setup in feature suites.

## TESTING FOCUS

- Verify keyboard interaction, focus management, ARIA semantics, and disabled states.
- Prefer behavioral assertions over snapshots of generated markup.
- Cover token-driven class or data-attribute contracts when consumers rely on them.

## ANTI-PATTERNS

- Building feature-specific abstractions into shared primitives
- Copying third-party examples without aligning them to project tokens and patterns
- Breaking primitive API consistency for one-off screens
- Reaching into stores, `window.electronAPI`, or feature services from a primitive
