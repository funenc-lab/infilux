# Component Governance

## Purpose

This document defines long-term component governance rules for Infilux.

Use it when deciding whether to:

- reuse an existing component
- extend an existing component
- compose a new feature component
- add a new primitive
- extract shared patterns
- introduce new props or variants
- split or consolidate UI modules

Treat this file as the product-level component governance policy. Implementation details still belong in `docs/design-system.md` and the actual source files.

## Governance Position

Infilux should grow through disciplined reuse, composition, and focused extraction.

The goal is not to build the largest component catalog. The goal is to keep the UI system:

- coherent
- predictable
- low-duplication
- easy to extend
- easy to review

Component growth should improve consistency, not create a second source of product entropy.

## Core Principles

1. Reuse before reinvention.
2. Composition before specialization.
3. Extract only when a pattern is truly shared.
4. Variants should clarify, not generalize blindly.
5. Primitives must remain stable and minimal.
6. Feature components should keep domain context.
7. Do not centralize what is not actually shared.

## Component Layers

Think about the UI in four layers.

### 1. Primitive UI layer

Location:

- `src/renderer/components/ui/`

Includes:

- buttons
- dialogs
- menus
- inputs
- popovers
- low-level display and form primitives

Rules:

- prefer existing `@coss/ui` patterns first
- keep primitives generic and stable
- avoid domain-specific knowledge in this layer
- do not add business logic or renderer-side platform access here

### 2. Shared composite layer

Includes reusable compositions such as:

- empty-state shells
- status chips
- glow cards
- shared toolbars
- repeated structured layouts

Rules:

- extract only when multiple product areas benefit
- preserve a clear single purpose
- avoid giant “do everything” composites

### 3. Feature component layer

Location examples:

- `src/renderer/components/layout/`
- `src/renderer/components/files/`
- `src/renderer/components/chat/`
- `src/renderer/components/source-control/`

Rules:

- keep domain-specific context in feature components
- compose from primitives and shared composites
- do not push feature-specific assumptions down into primitives

### 4. Workflow orchestration layer

Examples:

- large panel containers
- App-level coordination surfaces
- stateful workflow hosts

Rules:

- keep orchestration separate from primitive rendering
- prefer moving reusable visual pieces downward while keeping workflow logic local

## Preferred Decision Order

When building UI, decide in this order:

1. Can an existing `ui/` primitive already solve this?
2. Can existing feature code compose current primitives cleanly?
3. Is the pattern actually repeated across domains?
4. If repeated, should it become a shared composite rather than a primitive?
5. Only then decide whether a new primitive is justified.

If you skip straight to creating a new primitive, you are probably moving too fast.

## When to Reuse

Reuse an existing component when:

- the interaction model is already the same
- the visual semantics match
- only small content differences exist
- the new use case fits existing intent

Do not fork or clone a component just to change:

- spacing
- copy
- icon choice
- one or two minor visual details

Prefer composition, slots, or limited variants first.

## When to Extend

Extend an existing component when:

- the new use case is still the same conceptual component
- the new option can be expressed clearly as a small variant or prop
- the extension will benefit multiple call sites

Do not extend a component when the added prop:

- only exists for one odd case
- introduces unrelated behavior
- makes the API harder to understand
- leaks feature-specific knowledge into shared code

If a prop needs a paragraph of explanation, the abstraction is probably wrong.

## When to Extract Shared Components

Extract a shared component when all of these are true:

- the pattern appears in more than one meaningful place
- the structure is stable enough to name clearly
- extraction will reduce duplication without hiding intent
- the extracted unit has one obvious responsibility

Do not extract merely because code “looks similar”.

Superficial similarity is not enough. Shared responsibility is required.

## When to Create a New Primitive

Create a new primitive only when:

- no existing `ui/` primitive can model the interaction correctly
- the behavior is broadly reusable
- the primitive can remain domain-agnostic
- its API can stay compact and understandable

Before creating a primitive, verify:

- it is not just a themed wrapper for one feature
- it is not a one-off layout shortcut
- it does not duplicate a nearby primitive with slightly different naming

## Variant Governance

Variants are useful, but easy to abuse.

Good variants:

- size
- tone
- density
- emphasis
- semantic intent

Bad variants:

- feature-specific mode names
- hidden behavior changes
- variants that combine multiple concerns at once
- variants that require deep branching logic to understand

Variants should scale a component family, not conceal multiple different components inside one API.

## Naming Rules

Names should reflect responsibility, not implementation detail.

Prefer names that answer:

- what is this component for
- what role does it play in the interface

Avoid names that are:

- overly generic
- tied to temporary visual appearance
- tied to one current icon or label
- vague wrappers like `Thing`, `Wrapper`, or `Container`

Good naming reduces the need to inspect internals.

## Prop Design Rules

Component props should:

- be minimal
- be explicit
- reflect actual use cases
- avoid hidden coupling

Prefer:

- clear booleans only when they represent stable semantics
- small enums when there are well-defined display modes
- render props or slots only when composition really needs them

Avoid:

- prop explosion
- overlapping props
- multiple props that fight each other
- “escape hatch” props that bypass system rules

## Styling Governance

Component styling should follow system rules, not drift around them.

Rules:

- reuse system tokens and `control-*` patterns where appropriate
- avoid re-creating almost-identical style strings in multiple places
- keep shared styling logic centralized only when it improves consistency
- do not hardcode theme values that should come from tokens

If multiple components share the same visual grammar, they should eventually share implementation patterns too.

## State and Logic Boundaries

Do not turn every component into a stateful smart component.

Prefer:

- presentational units with explicit props
- hooks for reusable behavior
- feature-level containers for workflow state

Avoid:

- hidden state coupling
- components that fetch or orchestrate unrelated data directly
- pushing domain workflow logic into low-level reusable components

## Refactoring Guidance

When touching a messy component:

- improve the part necessary for the current work
- extract only the stable repeated parts
- avoid unrelated “cleanup” that expands scope
- preserve critical workflow behavior while refactoring

Component governance should reduce entropy incrementally, not trigger speculative redesign.

## Do / Do Not

### Do

- reuse `src/renderer/components/ui/` first
- extract stable repeated patterns
- keep primitives domain-agnostic
- keep feature logic in feature components
- keep APIs small and explicit
- use variants sparingly and intentionally

### Do Not

- add a new primitive for a one-off case
- duplicate an existing component because it is slightly inconvenient
- push domain logic into shared UI primitives
- create giant configurable components with unclear purpose
- use prop growth to avoid better boundaries
- bypass token and system styling rules

## Review Checklist

Before introducing or changing a component, check:

1. Did I try to reuse an existing primitive first?
2. Is this actually a shared pattern or just similar-looking code?
3. Does this component have one clear responsibility?
4. Are its props minimal and explicit?
5. Is domain logic staying in the correct layer?
6. Would another engineer understand when to use this component?
7. Does this change reduce duplication without hiding intent?

## Decision Priority

When component decisions conflict, resolve in this order:

1. clear responsibility
2. correct layering
3. reuse and consistency
4. maintainability
5. convenience
6. abstraction novelty

## Relationship to Other Documents

- `agents/design-context.md` defines long-term product tone
- `agents/interaction-patterns.md` defines behavior patterns components should support
- `agents/accessibility-rules.md` defines accessibility constraints components must respect
- `docs/design-system.md` defines implementation-facing component examples
- this file defines how the component system should evolve over time
