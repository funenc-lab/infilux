# Design Token Governance

## Purpose

This document defines long-term design token governance rules for Infilux.

Use it when deciding how to:

- add or change tokens
- map tokens into Tailwind theme variables
- derive semantic tokens
- introduce new presets
- support runtime theme sync
- layer background-image overlays
- decide whether a value should be a token at all

Treat this file as the product-level token governance policy. Concrete token definitions still live in the codebase and implementation examples remain in `docs/design-system.md`.

## Governance Position

Tokens are the shared language between product identity, theme behavior, component styling, and runtime personalization.

The goal is not to create the largest possible token inventory. The goal is to keep tokens:

- meaningful
- stable
- layered correctly
- semantically trustworthy
- safe to customize

A token system should reduce design drift and implementation inconsistency, not multiply them.

## Core Principles

1. Tokenize semantics, not accidents.
2. Keep layers explicit.
3. Foundation tokens must remain durable.
4. Semantic tokens must remain trustworthy.
5. Derived tokens should be traceable to their source.
6. Runtime overrides must stay bounded.
7. Fewer well-named tokens beat many ambiguous ones.

## Token Layers

Think about tokens in four layers.

### 1. Foundation tokens

Examples:

- `--background`
- `--foreground`
- `--card`
- `--popover`
- `--secondary`
- `--muted`
- `--border`
- `--input`
- `--primary`
- `--accent`
- `--ring`

Purpose:

- establish visual foundation
- define base surface hierarchy
- define the current theme identity

Rules:

- these tokens should be stable, predictable, and broadly reusable
- they may vary by mode, preset, or controlled runtime sync
- they should not directly encode one feature’s business meaning

### 2. Semantic tokens

Examples:

- `--destructive`
- `--success`
- `--warning`
- `--info`

Purpose:

- communicate durable business meaning
- support status, feedback, and operational semantics

Rules:

- semantic tokens must not be casually repurposed
- they must stay consistent across themes
- customization must not destroy their meaning

### 3. Derived product tokens

Examples:

- `--control-surface`
- `--control-surface-muted`
- `--control-border-strong`
- `--control-border-soft`
- `--control-chip-bg`
- `--control-live`
- `--control-wait`
- `--control-done`
- `--control-idle`

Purpose:

- adapt foundation and semantic tokens into product-specific console language
- encode reusable product grammar without hardcoding raw values repeatedly

Rules:

- derive these from foundation and semantic tokens where possible
- keep derivation logic understandable
- avoid introducing product-specific tokens that simply alias raw values without purpose

### 4. Contextual override tokens

Examples:

- `--panel-bg-opacity`
- preset-specific overrides
- terminal-sync-derived foundation overrides

Purpose:

- support bounded runtime customization
- allow context-sensitive treatment without rewriting the token model

Rules:

- overrides must be narrow and explicit
- overrides must not bypass semantic integrity
- local visual treatment should prefer scoped override variables over broad token reassignment

## Token Admission Rules

Before adding a new token, ask:

1. Is this a stable concept or a one-off value?
2. Will this token be reused across meaningful contexts?
3. Does the token name describe responsibility clearly?
4. Should this be a derived value instead of a new first-class token?
5. Is this actually a component concern rather than a system token?

If the answer is unclear, do not add the token yet.

## Naming Rules

Token names should describe function, not implementation trivia.

Prefer names that communicate:

- role
- semantic meaning
- scope
- layer

Avoid names tied to:

- one temporary screen
- one component quirk
- raw color appearance without semantic meaning
- implementation history

Good token names survive refactors. Bad token names lock design debt into the system.

## Source of Truth Rules

The system should maintain clear token ownership.

Preferred ownership:

- base token defaults in shared style foundations
- preset mappings in token/preset utilities
- runtime sync logic in focused theme adapters
- scoped overrides through narrow contextual variables

Avoid split ownership where multiple unrelated places fight over the same token category without a clear hierarchy.

## Override Hierarchy

Token overrides should follow a clear precedence model.

Recommended order:

1. base defaults
2. mode layer (`light` / `dark`)
3. preset layer
4. explicit customization layer
5. controlled runtime sync layer
6. narrow contextual overlay layer

Important:

- higher layers may override foundation identity
- higher layers must not silently destroy semantic meaning
- contextual overlays should be narrower than full theme overrides

## Runtime Token Rules

Runtime token mutation is allowed only when:

- the override source is explicit
- the affected token scope is limited
- readability remains protected
- semantic tokens remain trustworthy

Examples of valid runtime behavior:

- switching between light and dark
- loading a controlled preset
- applying terminal sync to foundation tokens
- applying background overlay opacity via a narrow variable

Examples of invalid runtime behavior:

- broad ad hoc token rewrites from unrelated feature logic
- overriding accent identity as a side effect of image treatment
- mutating semantic tokens for visual flavor

## Semantic Integrity Rules

Semantic tokens are protected.

Do not:

- map a theme accent directly into destructive meaning
- let waiting and completed collapse visually
- let semantic meaning drift between presets
- use semantic token names for decorative emphasis

Semantic trust is more important than thematic variety.

## Derived Token Rules

Derived tokens should exist only when they reduce repeated design logic.

Create derived tokens when:

- the product repeatedly uses the same visual grammar
- deriving in every component would create duplication
- the token expresses a real product concept

Do not create derived tokens when:

- a component can consume existing foundation tokens directly
- the derivation is too local to matter globally
- the token only exists to avoid naming the real abstraction problem

## Preset Governance

Presets should be structured, not ornamental.

Preset rules:

- preserve product identity
- preserve semantic reliability
- preserve surface hierarchy
- preserve readability
- differ through controlled foundation tone and accent identity

Presets should not feel like unrelated product skins.

## Customization Governance

Customization should operate inside bounded rules.

Allowed:

- preset switching
- custom accent selection where supported
- controlled terminal sync
- bounded contextual overlay variables

Not allowed:

- arbitrary per-component token fragmentation
- semantic-token drift
- unbounded user overrides that destroy hierarchy

## Component Consumption Rules

Components should consume tokens by intent.

Prefer:

- semantic tokens for semantic states
- product-derived tokens for product-specific console grammar
- foundation tokens for generic surface and text treatment

Avoid:

- bypassing tokens with hardcoded values
- locally recreating a token-like value repeatedly
- using the wrong layer just because it “looks close enough”

## Documentation Rules

When token behavior changes, document:

- which layer changed
- which tokens are affected
- whether the change is semantic, foundation, derived, or contextual
- whether presets or runtime sync behavior are impacted

A token change without governance context is a future regression source.

## Do / Do Not

### Do

- keep token layers explicit
- protect semantic tokens
- derive product tokens from stable foundations
- keep override hierarchy understandable
- use narrow contextual variables for localized treatment
- keep token names meaningful and durable

### Do Not

- add tokens for one-off styling accidents
- let multiple sources compete for the same token without hierarchy
- mutate semantic tokens for decorative reasons
- use contextual features to override broad identity tokens casually
- hardcode values where tokens should exist
- create token names that hide responsibility

## Review Checklist

Before changing tokens, check:

1. Which token layer is this change in?
2. Is this a new concept or just a new value?
3. Does the token name describe responsibility clearly?
4. Will this change preserve semantic meaning?
5. Is the override hierarchy still understandable?
6. Could a narrower override solve this instead?
7. Will another engineer understand where the source of truth now lives?

## Decision Priority

When token decisions conflict, resolve in this order:

1. semantic integrity
2. readability and hierarchy
3. source-of-truth clarity
4. product consistency
5. customization flexibility
6. token count convenience

## Relationship to Other Documents

- `agents/theme-palette-policy.md` defines high-level theme behavior
- `agents/accessibility-rules.md` defines contrast and semantic readability constraints
- `agents/component-governance.md` defines how components should consume system primitives
- `docs/design-system.md` defines implementation-facing token usage examples
- this file defines how the token system itself should evolve over time
