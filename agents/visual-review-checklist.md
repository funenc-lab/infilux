# Visual Review Checklist

## Purpose

This document defines the recurring visual review checklist for Infilux.

Use it when reviewing:

- new screens
- panel redesigns
- list and sidebar changes
- empty states
- token changes
- interaction styling
- status presentation
- polished UI refinements before shipping

Treat this file as the product-level visual review checklist. It complements, but does not replace, design principles, interaction rules, accessibility rules, and token governance.

## Review Position

Infilux is a dense operational console. Visual review is not about “does it look nice” in isolation.

It is about whether the interface:

- communicates context quickly
- preserves state clarity
- supports action without confusion
- remains calm under density
- stays consistent with the product’s dark-first, restrained-premium character

Good visual review protects the product from drift, not just obvious ugliness.

## Core Questions

Review every UI change through these questions:

1. Is the current context readable immediately?
2. Is the primary next action visually obvious?
3. Are hierarchy and density both under control?
4. Are states clear without overusing color or decoration?
5. Does the UI still feel like Infilux rather than a generic dashboard?

If two or more answers are unclear, the design is not ready.

## 1. Context Clarity

Check:

- Can the user identify the current repository, worktree, agent, or panel context quickly?
- Is the main working object visually clear?
- Are secondary metadata and path details properly de-emphasized?
- Does the current screen preserve situational awareness instead of flattening all information?

Fail patterns:

- important context hidden behind weak typography
- metadata competing with primary object labels
- current active scope not visually obvious

## 2. Hierarchy and Density

Check:

- Is there a visible separation between primary, secondary, and tertiary information?
- Does the layout feel intentionally dense rather than crowded?
- Are spacing and rhythm consistent?
- Are repeated rows, chips, and controls aligned predictably?

Fail patterns:

- all text feels equally important
- dense views become noisy because hierarchy is weak
- uneven spacing creates visual instability

## 3. State Semantics

Check:

- Are running, waiting, completed, idle, and destructive states visibly distinct?
- Are status colors used semantically rather than decoratively?
- Can the user understand the state even if they ignore color?
- Are state chips readable inside dense lists and sidebars?

Fail patterns:

- accent color used where semantic color should be used
- multiple states collapse into similar appearance
- decorative emphasis overwhelms state meaning

## 4. Action Clarity

Check:

- Is the primary action obvious without hunting?
- Are inline actions subordinate to the object they act on?
- Are secondary actions discoverable but not noisy?
- Do destructive actions feel deliberate rather than casually adjacent?

Fail patterns:

- row actions overpower row identity
- too many equal-priority buttons
- important actions hidden while low-value controls stay prominent

## 5. Selection, Focus, and Active State

Check:

- Are hover, focus, selected, and active states clearly distinct?
- Is the currently selected item more obvious than merely hovered items?
- Is keyboard focus visible and stable?
- Is live activity distinguishable from static selection?

Fail patterns:

- hover and selected look nearly identical
- active and selected are confused
- focus is technically present but visually weak

## 6. Surface and Token Consistency

Check:

- Are the correct surfaces used for primary panels vs muted panels?
- Are tokens used consistently instead of hardcoded values?
- Does the screen still align with the neutral dark-first product base?
- Are overlays, background treatments, and sync-terminal effects staying within system rules?

Fail patterns:

- panels revert to generic white-card or random-gray treatment
- one area uses token-driven styling while another hardcodes similar values
- background image treatment weakens accent or hierarchy

## 7. Typography and Readability

Check:

- Are titles, labels, metadata, and paths typographically separated?
- Is truncation handled safely?
- Are long names and paths still readable enough to act on?
- Is small text still useful rather than merely decorative?

Fail patterns:

- path text louder than object names
- unreadable truncation in important rows
- metadata so quiet it stops being useful

## 8. Empty State Quality

Check:

- Does the empty state explain what is missing?
- Does it explain what the user should do next?
- Is there a meaningful action path?
- Does it feel like a workbench, not a poster?

Fail patterns:

- empty state is visually polished but operationally useless
- decorative icon dominates while next action is weak
- welcome-style filler replaces actionable guidance

## 9. Motion Restraint

Check:

- Does motion help explain layout, selection, or state transitions?
- Is animation restrained in dense surfaces?
- Would the screen still read well if motion were removed?
- Are there too many animated hotspots competing at once?

Fail patterns:

- motion used to create excitement rather than clarity
- repeated pulsing across dense lists
- transitions that slow down routine work

## 10. Product Character

Check:

- Does the screen still feel calm, precise, and operational?
- Is the futuristic quality restrained and mature?
- Does the design avoid generic SaaS softness and decorative AI clichés?
- Does the interface feel premium through precision rather than spectacle?

Fail patterns:

- consumer productivity softness
- noisy gradient-heavy emphasis
- cyberpunk or ornamental AI styling
- visual drama that weakens trust

## Quick Ship Checklist

Before shipping any notable UI change, confirm:

- current context is obvious
- primary action is obvious
- state meaning is unambiguous
- focus is visible
- density is controlled
- no token drift is introduced
- no decorative styling competes with operational clarity

## Red Flags

Stop and rework if you see:

- “looks nice” but context is harder to parse
- more color without better meaning
- more motion without better understanding
- more components without better consistency
- denser layout with weaker hierarchy
- stronger decoration with weaker operational trust

## Relationship to Other Documents

- `agents/design-context.md` defines long-term visual intent
- `agents/theme-palette-policy.md` defines palette and semantic-color guardrails
- `agents/accessibility-rules.md` defines readability and focus requirements
- `agents/motion-principles.md` defines motion restraint and purpose
- `agents/interaction-patterns.md` defines behavior expectations
- `docs/design-system.md` defines implementation-facing styling examples
- this file defines the recurring visual review lens to apply across all of them
