# Accessibility Rules

## Purpose

This document defines persistent accessibility expectations for Infilux.

Use it when designing or changing:

- layout hierarchy
- color and contrast
- keyboard interaction
- focus treatment
- animation and motion behavior
- dense operational UI patterns
- status presentation
- background image treatments

Treat this file as a product-level accessibility policy. Component usage details still belong in `docs/design-system.md`.

## Accessibility Position

Infilux is a dense, dark-first operational tool for individual developers. Density is allowed. Ambiguity is not.

The goal is not to simplify the interface into a generic consumer product. The goal is to preserve expert efficiency while ensuring the interface remains perceivable, operable, understandable, and robust.

Accessibility should be treated as a design quality multiplier, not as a late compliance pass.

## Core Principles

1. Critical context must remain visible at a glance.
2. Keyboard access is a first-class interaction path.
3. Focus must always be visible.
4. Status must never rely on color alone.
5. Motion must support orientation, not spectacle.
6. Density is acceptable only when hierarchy remains clear.
7. Personalization must not reduce readability or semantic meaning.

## Readability and Contrast

### Text contrast

- Primary text must maintain strong readable contrast against its background.
- Muted text may be quieter, but it must remain readable in long-duration sessions.
- Tiny metadata text must not become visually decorative noise.

### Surface contrast

- Major surfaces must stay distinguishable: app background, primary panels, muted panels, inputs, overlays, and chips.
- Surface separation should remain visible in both default themes and synced themes.
- Background image overlays must not collapse panel hierarchy.

### Accent contrast

- Accent and primary colors must remain visible enough for focus and orientation.
- Accent contrast must not be so low that selected state becomes ambiguous.
- Accent color must never be the sole carrier of critical meaning.

## Keyboard and Focus

### Keyboard operation

All important actions should be reachable without a mouse, especially:

- navigation between core panels
- worktree and repository selection
- settings interaction
- dialogs and menus
- editor-adjacent controls
- review and source-control workflows

### Focus visibility

- `focus-visible` must remain globally enabled.
- Focus treatment must be visually distinct from hover and selected state.
- Focus indicators must survive dark themes, synced themes, and background image modes.
- If a control is actionable, a keyboard user must be able to discover that action path.

### Focus order

- Focus order must follow visual and operational logic.
- Avoid trap-like focus behavior unless inside an intentional modal context.
- Restoring focus after dialog close or temporary overlays should feel predictable.

## Status Communication

Operational state must never rely on hue alone.

When representing status such as running, waiting, completed, idle, or destructive:

- use color plus shape, label, position, or iconography
- maintain short readable state labels
- preserve chip contrast in dense lists and sidebars
- avoid using decorative color changes as substitutes for explicit state

Users should still understand status when:

- color perception differs
- screen brightness is poor
- synced themes shift hue relationships
- background imagery is enabled

## Motion and Reduced Motion

Motion should aid comprehension, not attract attention to itself.

### Motion rules

- use motion to explain state change, continuity, and hierarchy
- keep durations short and purposeful
- avoid ornamental looping motion in primary work surfaces
- avoid stacking multiple competing animations in dense layouts

### Reduced motion expectation

The product should support a reduced-motion path for:

- large transitions
- repeated micro-animations
- attention-seeking animated effects
- non-essential floating or pulsing treatment

If motion is decorative rather than informative, it should be removable.

## Dense UI Guidance

Dense professional UI is acceptable only when it remains scannable.

Requirements:

- strong primary / secondary / tertiary information separation
- stable row height and alignment
- truncation that preserves meaning
- enough spacing to avoid accidental activation
- visible active and selected states

Do not justify overcrowding with "power user" assumptions when the result reduces comprehension.

## Background Image Accessibility

Background images are optional atmosphere, not content.

Rules:

- they must not impair text readability
- they must not erase accent identity
- they must not weaken focus indicators
- they must not reduce status clarity
- they must remain subordinate to panel overlays

When readability conflicts with visual atmosphere, readability wins.

## Theme and Personalization Safety

Customization is welcome, but accessibility constraints remain in force.

This applies to:

- color presets
- custom accent colors
- terminal full sync
- background image overlays

Theme customization must not:

- lower core text contrast below practical usability
- blur active versus inactive states
- make destructive and safe actions too similar
- make waiting and completed states hard to distinguish
- hide focus indicators

## Copy and Labels

- Use short, direct labels for operational states and actions.
- Avoid vague labels where the action has consequences.
- Destructive actions should read as destructive.
- Empty states should explain the current problem and the next useful action.

Accessibility improves when wording removes ambiguity before styling has to compensate.

## Review Checklist

Before shipping UI changes, check:

1. Can the current context be understood quickly?
2. Can the key workflow be completed by keyboard?
3. Is focus clearly visible at every step?
4. Is any important meaning conveyed only by color?
5. Does the UI remain readable in dark mode, synced themes, and background image mode?
6. Would reduced motion users still understand all key transitions?
7. Are dense views still scan-friendly under real data?

## Decision Priority

When accessibility conflicts with aesthetics, resolve in this order:

1. readability
2. operability
3. semantic clarity
4. workflow efficiency
5. visual style
6. decorative flourish

## Relationship to Other Documents

- `agents/design-context.md` defines long-term visual intent
- `agents/theme-palette-policy.md` defines token and palette guardrails
- `docs/design-system.md` defines component-level implementation rules
- this file defines enduring accessibility expectations across all of them
