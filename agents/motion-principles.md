# Motion Principles

## Purpose

This document defines enduring motion rules for Infilux.

Use it when designing or changing:

- transitions
- panel movement
- modal and menu entrance/exit behavior
- micro-interactions
- list animation
- layout animation
- status animation
- reduced-motion behavior

Treat this file as the product-level motion policy. Concrete implementation utilities remain in `src/renderer/lib/motion.ts`, and component examples remain in `docs/design-system.md`.

## Motion Position

Infilux is an operational console, not a motion showcase.

Motion should strengthen:

- orientation
- continuity
- hierarchy
- action feedback
- perceived responsiveness

Motion should not exist to make the product feel louder, trendier, or more "AI".

The correct feeling is calm precision with fast response, not theatrical movement.

## Core Principles

1. Motion must explain change.
2. Motion must stay subordinate to information.
3. Fast is better than flashy.
4. Small motion is preferred over broad motion.
5. Repetition must be restrained.
6. Dense interfaces need calmer motion, not more motion.
7. Decorative motion must yield to accessibility and focus.

## What Motion Is For

Use motion to communicate:

- where something came from
- where it is going
- what changed
- what is currently active
- what is entering temporary focus
- whether an action succeeded, needs attention, or is still in progress

If the user cannot explain what a motion helps them understand, the motion is probably unnecessary.

## Product Tempo

Infilux should feel:

- quick
- controlled
- deliberate
- stable

Preferred timing posture:

- short transitions for primary actions
- spring motion for spatial continuity
- minimal delay before useful feedback
- no sluggish easing in core workflows

The product should never feel floaty, sticky, playful, or cinematic.

## Hierarchy of Motion

### 1. Structural motion

Highest-value motion. Used for:

- panel expansion and collapse
- modal and popover entry
- layout continuity
- tab indicators
- list reordering

Structural motion helps the user maintain orientation in a dense interface.

### 2. Feedback motion

Used for:

- button press feedback
- active state confirmation
- small hover response
- success or attention transitions

Feedback motion should be subtle and brief.

### 3. Ambient motion

Lowest priority. Includes:

- looping decorative effects
- ornamental shimmer
- persistent animated glow
- attention-seeking idle motion

Ambient motion should be rare. In most core work surfaces, it should be avoided.

## Motion Constraints in Dense UI

Because Infilux is dense and status-rich:

- avoid many simultaneous moving elements in the same area
- avoid large travel distances for common interactions
- avoid repeated pulsing in lists, sidebars, and control surfaces
- avoid motion that competes with code, text, or status chips

When the interface is already information-dense, motion must become quieter, not stronger.

## Micro-Interaction Policy

Micro-interactions are allowed when they improve confidence.

Good uses:

- press response on buttons
- subtle hover lift for clear affordances
- active indicator glide
- compact reveal/hide transitions

Bad uses:

- bounce for personality
- exaggerated scale on routine controls
- hover effects that shift layout
- repeated animated emphasis on ordinary controls

Micro-interactions should confirm intent, not perform personality.

## Status Animation Policy

Status animation should be used sparingly.

Allowed:

- minimal live-state indication
- entry transitions for newly completed or newly active items
- controlled progress or waiting indicators

Not allowed:

- constant pulsing across many rows
- bright animated states that overpower content
- multiple animated status signals competing in one panel

Status should remain understandable even if animation is removed entirely.

## Modal, Menu, and Panel Motion

### Dialogs and menus

- should enter quickly
- should feel anchored to user action
- should not overshoot dramatically
- should leave quickly when dismissed

### Panels and drawers

- should preserve spatial logic
- should use layout-aware transitions rather than abrupt jumps where feasible
- should not block interaction longer than necessary

### Empty and loading states

- should avoid heavy theatrical entrance motion
- should remain readable immediately
- should not delay the next useful action

## Layout Animation Rules

Layout animation is useful when it preserves mental continuity.

Use it for:

- reordering
- active indicator movement
- panel size changes
- accordion-like reveal

Avoid it when:

- the animation obscures interaction timing
- many items update at once
- it introduces lag into common workflows

Continuity is valuable. Dragging out change is not.

## Reduced Motion

Reduced motion support is a product requirement, not a nice-to-have.

When motion is reduced:

- keep essential state changes visible
- remove decorative scaling, pulsing, and ornamental transitions
- shorten or eliminate non-essential spatial travel
- retain clarity through opacity, instant state changes, or minimal transforms

Reduced motion should preserve understanding, not create abrupt confusion.

## Performance Rules

Motion quality depends on responsiveness.

Rules:

- prefer `transform` and `opacity`
- be cautious with `height: auto` on large dynamic content
- avoid layered blur-heavy motion in frequently updated areas
- avoid animating many expensive surfaces at once
- do not trade responsiveness for theatrical polish

Slow motion is not premium. It is friction.

## Do / Do Not

### Do

- use motion to explain hierarchy and continuity
- keep transitions short and intentional
- favor subtle feedback over large gestures
- reduce motion in dense operational areas
- support reduced-motion users
- prefer stable, readable state changes over decorative animation

### Do Not

- animate for spectacle
- add cyberpunk or futuristic motion clichés
- pulse many items at once
- use motion to compensate for weak hierarchy
- delay important information behind animation
- rely on motion as the only signal of change

## Review Checklist

Before shipping motion changes, check:

1. What does this animation help the user understand?
2. Is it faster and clearer than a simpler alternative?
3. Does it compete with text, code, or status information?
4. Would the UI still work well with reduced motion?
5. Is the effect repeated too often in dense areas?
6. Does it preserve calm, dark-first operational character?
7. Does it improve confidence more than it increases noise?

## Decision Priority

When motion conflicts with other concerns, resolve in this order:

1. clarity
2. responsiveness
3. accessibility
4. workflow continuity
5. visual polish
6. expressive flourish

## Relationship to Other Documents

- `agents/design-context.md` defines long-term product tone
- `agents/accessibility-rules.md` defines motion accessibility expectations
- `agents/theme-palette-policy.md` defines color and token guardrails motion must respect
- `docs/design-system.md` defines implementation-facing examples
- `src/renderer/lib/motion.ts` contains reusable motion primitives
