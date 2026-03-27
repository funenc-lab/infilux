# Theme and Palette Policy

## Purpose

This document defines how theme, palette, semantic color, and terminal synchronization should work across Infilux.

Use this file when making decisions about:

- color tokens
- dark and light theme behavior
- semantic state colors
- panel and surface layering
- terminal theme synchronization
- user customization boundaries

Treat this file as a policy document, not a component recipe. Component-level usage still belongs in `docs/design-system.md`.

## Policy Summary

Infilux is a dark-first product with a stable neutral control-console foundation.

The default visual identity should remain:

- calm
- professional
- terminal-adjacent
- restrained-premium

The system may support strong personalization, including terminal-theme-driven full sync, but only inside hard readability and semantic guardrails.

## Theme Model

The theme system should be understood as three layers.

### 1. Foundation Layer

This layer defines the durable control-console base:

- `background`
- `foreground`
- `card`
- `popover`
- `muted`
- `border`
- `input`
- surface relationships such as control panels and muted panels

Default behavior:

- dark-first is the primary design target
- surfaces should remain neutral or near-neutral by default
- hierarchy between page background, control panels, muted panels, inputs, and dividers must remain legible and stable

Even when colors are customized, the interface must still read as a serious operational console rather than a decorative themed shell.

### 2. Semantic Layer

This layer defines business meaning and runtime state.

These tokens and derived styles are semantic, not decorative:

- `destructive`
- `success`
- `warning`
- `info`
- `control-chip-live`
- `control-chip-wait`
- `control-chip-done`

Rules:

- semantic meaning must remain stable across all themes
- the same semantic color family must not be reassigned to a different meaning
- semantic tokens must never become so muted or so stylized that their operational meaning becomes ambiguous
- status clarity takes precedence over thematic coherence

### 3. Personalization Layer

This layer includes:

- presets
- user-defined color customization
- terminal theme synchronization

Personalization is allowed only when it preserves:

- semantic stability
- contrast
- scanability
- panel hierarchy
- focus visibility

Customization is a privilege layer on top of the product identity, not a license to dissolve it.

## Dark-First Baseline

The default baseline should always assume long-duration use in dark environments.

This means:

- dark mode receives the highest design fidelity
- surface contrast should feel controlled, not harsh
- bright accent usage should stay localized
- large bright fills should be avoided in core control surfaces
- visual fatigue should be minimized during sustained use

Light mode may be supported, but the product identity should still be recognizable as the same operational system rather than a different product skin.

## Neutral Base Principle

By default, Infilux should use a neutral or low-chroma console foundation.

That means:

- primary identity comes from structure, density, motion, and state semantics
- not from large branded washes or colorful panels
- panels should read as tools, not as decorative cards

Preferred baseline behavior:

- neutral dark surfaces
- restrained borders
- subtle tonal separation between layers
- selective use of accent color for focus, current object, and actionable emphasis

## Accent Policy

Accent is for orientation and emphasis, not for universal clickability.

Use accent and primary tokens for:

- current selection
- current focus target
- important active controls
- line or tab indicators
- keyboard and focus affordances

Do not use accent for:

- all clickable elements
- broad decorative fills
- replacing semantic state colors
- making the UI feel artificially more futuristic

## Semantic Color Policy

Semantic tokens must remain operationally reliable.

### Stable meanings

- `live` or `running`: active execution state
- `wait`: waiting for user attention or intervention
- `done`: completed and reviewable
- `destructive`: irreversible or dangerous action
- `success`: successful confirmation with business meaning
- `warning`: caution or elevated attention
- `info`: informational guidance with clear utility

### Constraints

- semantic colors must preserve meaning in both default themes and synced themes
- destructive must always remain clearly distinct from primary and accent
- waiting must not collapse into success or done
- done must not become visually identical to idle
- state chips must remain scannable in dense lists and sidebars

If theme customization threatens semantic distinction, semantic distinction wins.

## Terminal Sync Policy

Infilux supports terminal-theme-driven synchronization, including a controlled full-sync mode.

However, "full sync" does not mean unrestricted color replacement. It means terminal identity can influence the full application palette within product safety constraints.

### Allowed behavior in full sync

When `sync-terminal` is enabled, the system may derive:

- `background`
- `foreground`
- `card`
- `popover`
- `muted`
- `accent`
- `primary`
- `ring`
- selection and editor-adjacent visual accents

from the terminal theme.

### Required guardrails

Even in full sync mode, the system must preserve:

1. semantic state clarity
2. sufficient contrast between text and background
3. clear separation between control surfaces
4. visible focus and selection states
5. readable muted text
6. a dark-first operational feel unless the user explicitly enters a light-capable synced theme mode

### Clamping rules

Full sync should be treated as controlled transformation, not raw passthrough.

Theme application logic should clamp or normalize extreme themes when needed:

- overly low-contrast themes
- overly saturated themes
- themes where accent and destructive become too similar
- themes where muted and background collapse together
- themes where foreground loses readability on derived surfaces

If a terminal theme is visually impressive but operationally unreadable, the system must correct it.

## Surface Hierarchy Policy

The relationship between major surfaces must survive all theme modes.

These distinctions should remain visible:

- app background
- primary control panel
- muted control panel
- input surface
- chip surface
- divider and border layers

Theme variation may shift hue and tonal flavor, but it must not erase the hierarchy.

Users should still be able to answer at a glance:

- what is the main workspace
- what is secondary context
- what is interactive
- what is currently active
- what requires attention

## Clarity and Readability Rule

Clarity is a hard rule for every shipped theme, not a style preference.

No preset, custom theme, synced theme, or editor palette may trade readability for mood, softness, or atmospheric realism.

Required outcomes:

- text must stay immediately readable in long sessions
- muted text may soften hierarchy, but must not look foggy or low-confidence
- app background, card, secondary surface, and border layers must remain distinguishable at a glance
- focus accents, rings, and current-selection surfaces must read clearly without relying on guesswork
- editor line numbers, indent guides, and active guides must remain visible enough to support navigation

Forbidden outcomes:

- dark themes collapsing into flat middle-gray surfaces
- low-contrast borders that make panels feel blurred together
- muted text that looks washed out instead of intentionally de-emphasized
- focus states that disappear into nearby neutrals
- editor chrome that looks elegant in screenshots but becomes vague during actual coding

Implementation rule:

- every preset change must be backed by automated readability checks
- readability thresholds must be enforced in tests for both app theme tokens and editor palettes
- when atmosphere conflicts with clarity, clarity wins

## Background Image Overlay Policy

Background imagery is a surface treatment, not a theme source.

Its purpose is to let the workspace breathe visually while preserving the active theme identity.

### Allowed influence

Background image mode may affect:

- panel transparency
- perceived depth
- surface translucency for background, card, and popover layers
- muted surface density when needed for legibility

### Forbidden influence

Background image mode must not:

- replace the current accent identity
- override primary focus color
- redefine semantic colors
- weaken destructive, warning, success, or info meaning
- blur the distinction between selection and passive surfaces

### Implementation rule

Background image handling should prefer a narrow overlay variable model, such as panel opacity controls, instead of directly rewriting broad theme tokens from JavaScript.

If an overlay system needs to change appearance, it should do so through:

- bounded transparency variables
- CSS-level overlay rules
- localized surface adjustments

not through ad hoc runtime reassignment of accent or semantic tokens.

### Priority rule

When background image treatment conflicts with theme identity:

1. readability wins
2. semantic clarity wins
3. accent identity wins
4. decorative image treatment loses

## Custom Theme Policy

User-defined themes are welcome, but they must be bounded.

Custom theme systems should:

- expose meaningful tokens rather than arbitrary per-component overrides
- encourage presets and structured customization
- validate contrast and semantic safety
- preserve state color intent
- reject or auto-correct invalid combinations when necessary

Preferred customization model:

- stable foundation tokens
- controlled accent choice
- optional terminal sync
- semantic colors that remain protected or only lightly adjustable

## Do / Do Not

### Do

- preserve a neutral dark operational baseline
- use accent sparingly and intentionally
- keep runtime state colors semantically fixed
- keep background-image overlays subordinate to the active theme
- allow personalization through bounded token systems
- correct invalid synced themes automatically
- prefer consistency and scanability over novelty

### Do Not

- let full sync destroy semantic meaning
- let brand or terminal colors dominate every surface
- let background-image mode erase accent identity
- use bright color fills to fake hierarchy
- make destructive, waiting, and completed states visually ambiguous
- optimize for screenshot flair at the expense of long-session usability
- treat customization as more important than operational clarity

## Decision Priority

When theme decisions conflict, resolve them in this order:

1. operational readability
2. semantic correctness
3. surface hierarchy
4. dark-first product identity
5. personalization fidelity
6. visual novelty

## Relationship to Other Documents

- `agents/design-context.md` explains product personality and long-term style intent
- `docs/design-system.md` explains tokens, components, spacing, and interaction usage
- this file governs how palette behavior and theme customization should be constrained across the product
