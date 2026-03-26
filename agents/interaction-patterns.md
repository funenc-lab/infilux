# Interaction Patterns

## Purpose

This document defines enduring interaction patterns for Infilux.

Use it when designing or changing:

- navigation flows
- panel switching
- repository and worktree selection
- context menus
- dialogs and confirmations
- empty states
- list interactions
- destructive actions
- multi-step operational workflows

Treat this file as a product-level interaction policy. Component examples remain in `docs/design-system.md`.

## Interaction Position

Infilux is a control console for active development orchestration.

Interaction should feel:

- direct
- predictable
- keyboard-capable
- context-aware
- operational rather than decorative

Users should feel like they are routing work, switching context, and acting on execution units — not browsing generic content cards.

## Core Principles

1. Context before action.
2. The primary next action must be obvious.
3. Selection, focus, and activation must stay distinct.
4. Critical actions must feel deliberate.
5. Empty states must lead to action.
6. Dense flows must remain predictable.
7. Temporary UI should never disorient the user.

## Interaction State Model

The following states must remain distinguishable:

- idle
- hover
- focused
- selected
- active
- disabled
- destructive
- waiting for user input

Rules:

- hover is discoverability
- focus is keyboard orientation
- selected is current target
- active is current live operation or current pressed/engaged state
- destructive must feel more deliberate than ordinary actions

Do not collapse these states into one shared visual treatment.

## Navigation Patterns

### Global navigation

Top-level navigation should answer two questions quickly:

1. where am I
2. what can I do next

Navigation controls should preserve current system context, especially:

- current repository
- current worktree
- current agent or session state
- current panel or task area

Changing views must not erase situational awareness.

### Panel switching

Switching panels should:

- preserve user orientation
- avoid surprising remount or state loss where retention is expected
- keep active context visible when possible
- feel quick enough for repeated use

Panel switching is a workflow action, not a dramatic scene change.

## Selection Patterns

Selection is central to the product.

### Repository and worktree lists

Users must be able to understand:

- what item is currently selected
- what item is live or active
- what item is merely hovered
- what item contains actionable status

Selected state should remain stronger than hover but calmer than destructive attention.

### List rows

Rows should support:

- click to select
- context menu for secondary operations
- keyboard traversal where appropriate
- drag and reorder only when reordering is meaningful

Do not overload a row with so many inline actions that its primary selection target becomes unclear.

## Empty State Patterns

An empty state must act like an operational prompt, not like a marketing placeholder.

Every empty state should answer:

1. what is missing
2. why it matters
3. what action should happen next

Required elements:

- short problem framing
- next action guidance
- at least one meaningful action path

Avoid:

- vague welcome text
- decorative emptiness without action
- oversized illustrations that weaken focus

## Context Menu Patterns

Context menus should be used for secondary, object-bound operations.

Use them when:

- actions are specific to a selected object
- showing all actions inline would create noise
- the user expects object-level control

Context menus should not become a hiding place for core actions users need constantly.

Rules:

- keep labels short and explicit
- separate destructive actions clearly
- preserve object context mentally and visually
- menu actions should map cleanly back to the selected item

## Dialog and Confirmation Patterns

Dialogs are for interruption-worthy decisions.

Use dialogs when:

- confirmation is necessary
- data entry needs focused attention
- destructive consequences require deliberate review
- a multi-step object creation flow needs temporary isolation

Do not use dialogs for ordinary navigation or lightweight inspection.

### Confirmation rules

Confirmations should clearly state:

- what will happen
- what object is affected
- whether the action is reversible

Destructive confirmations should reduce ambiguity, not add tension.

## Destructive Action Patterns

Destructive actions must feel intentional.

Requirements:

- clear destructive labeling
- separation from safe actions
- no accidental default emphasis
- confirmation when consequences are meaningful or irreversible

When appropriate, surface safer alternatives first:

- cancel
- close
- archive
- revert

Destructive action design should reduce mistakes, not merely decorate risk.

## Inline Action Patterns

Inline actions are useful when speed matters, but they must remain subordinate to the object they belong to.

Good inline actions:

- refresh
- open
- copy
- quick add
- quick remove with confirmation path when needed

Rules:

- object identity comes first
- inline controls must not overpower row content
- icon-only actions need clear affordance and tooltip/title support where useful
- repeated inline controls should stay positionally consistent

## Multi-Step Workflow Patterns

Infilux contains operational workflows such as:

- create repository or worktree
- switch execution context
- review code or changes
- configure providers and integrations

Multi-step flows should:

- keep progress understandable
- keep critical context visible
- avoid hidden branching where possible
- let users recover from cancellation predictably

If a workflow can be shortened without losing clarity, shorten it.

## Feedback Patterns

Action feedback should be immediate and proportional.

Use feedback to answer:

- did the action start
- did it succeed
- does it need user input
- did it fail

Feedback channels may include:

- inline state change
- chip/status update
- toast
- dialog
- panel content update

Prefer the least disruptive channel that still preserves clarity.

## Keyboard Interaction Expectations

Interaction design should assume keyboard use in core workflows.

Important interaction paths should support:

- discoverable focus movement
- visible active target
- predictable Enter/Escape behavior
- menu and dialog usability without mouse dependence

Do not create interaction patterns that only make sense with pointer hover.

## Review Checklist

Before shipping interaction changes, check:

1. Is the current context always clear before the user acts?
2. Is the primary next action obvious?
3. Are hover, focus, selection, and active states distinct?
4. Are destructive actions sufficiently deliberate?
5. Do empty states lead to action?
6. Can the core flow be completed quickly and predictably?
7. Does temporary UI preserve orientation rather than interrupt it unnecessarily?

## Decision Priority

When interaction choices conflict, resolve in this order:

1. context clarity
2. predictability
3. workflow speed
4. accessibility
5. visual polish
6. novelty

## Relationship to Other Documents

- `agents/design-context.md` defines long-term product tone
- `agents/accessibility-rules.md` defines keyboard and focus expectations
- `agents/motion-principles.md` defines how transitions should support interaction
- `docs/design-system.md` contains implementation-facing examples
- this file defines enduring product interaction behavior
