# Content Copy Guidelines

## Purpose

This document defines long-term UI copy guidelines for Infilux.

Use it when writing or changing:

- labels
- buttons
- empty-state copy
- status text
- helper text
- dialog titles and descriptions
- destructive confirmations
- toasts and transient feedback
- settings descriptions

Treat this file as the product-level UI copy policy. It complements interaction, accessibility, and visual governance rather than replacing them.

## Copy Position

Infilux is an operational console for individual developers.

Its copy should feel:

- calm
- precise
- direct
- technically credible
- action-oriented

The product should not sound:

- chatty
- cute
- generic SaaS-friendly
- marketing-heavy
- theatrically “AI”

The interface should speak like a reliable tool under load, not like a product landing page.

## Core Principles

1. Say what is happening.
2. Say what the user can do next.
3. Prefer operational clarity over warmth.
4. Be brief, but not vague.
5. Destructive copy must sound destructive.
6. Status text should scan quickly.
7. Empty states should lead to action.

## Tone

Preferred tone:

- direct
- calm
- professional
- confident
- low-drama

Preferred voice:

- concise instructions
- explicit consequences
- short action labels
- plain descriptions of system state

Avoid:

- hype
- playful filler
- anthropomorphic system behavior
- apology-heavy wording when not needed
- decorative adjectives that add no clarity

## Clarity Rules

Good copy should help the user answer:

- what is this
- what state is it in
- what happens if I click this
- what should I do next

If the wording sounds polished but still leaves those questions unresolved, it is not good copy.

## Label Guidelines

Labels should be:

- short
- explicit
- verb-led when action is involved
- noun-led when identifying an object or section

Prefer:

- `Create worktree`
- `Remove repository`
- `Open in Cursor`
- `Waiting for input`

Avoid:

- vague verbs like `Handle`, `Process`, `Manage` without context
- generic labels like `Continue` when the target is unclear
- overly long labels that include explanatory prose

## Button Copy

Buttons should communicate the action outcome clearly.

Preferred:

- `Create`
- `Delete worktree`
- `Save changes`
- `Retry`
- `Open settings`

Avoid:

- ambiguous buttons like `Confirm` when object and consequence are important
- decorative buttons like `Let’s go`
- emotionally flavored action labels

If a destructive action matters, name the action directly.

## Status Copy

Status text should optimize for scanability.

Rules:

- keep status labels short
- use stable wording for recurring states
- avoid sentence-length status when a compact phrase is enough
- do not introduce multiple labels for the same state concept

Preferred examples:

- `Running`
- `Waiting`
- `Completed`
- `Idle`
- `Syncing`
- `Failed`

Avoid:

- `Everything looks good`
- `We are currently processing your request`
- multiple near-synonyms for the same state

## Empty State Copy

Empty states must explain both absence and next action.

Every empty state should communicate:

1. what is missing
2. why it matters
3. what the user should do next

Preferred shape:

- short title
- brief explanation
- actionable next step

Avoid:

- welcome-banner language
- decorative inspiration text
- generic positivity that ignores the missing state

Good empty states behave like operational prompts.

## Dialog Copy

Dialogs should reduce ambiguity, not add ceremony.

Title:

- short and specific
- ideally names the action or consequence

Description:

- explain what will happen
- identify the affected object when relevant
- say whether the action is reversible

Avoid:

- generic titles like `Notice`
- descriptions that restate the title without adding consequence
- overlong warning paragraphs when one direct sentence is enough

## Destructive Copy

Destructive copy must be unmistakable.

Rules:

- name the destructive action directly
- identify what will be removed, discarded, or reset
- say when the action cannot be undone
- avoid softening language that hides the consequence

Preferred:

- `Delete worktree`
- `Discard unsaved changes`
- `This cannot be undone`

Avoid:

- `Clean up`
- `Remove it`
- `Proceed`

If the user could lose work, the copy should say so plainly.

## Toast and Feedback Copy

Toast copy should be brief and informative.

Use toasts to answer:

- what just happened
- whether it worked
- what needs attention next, if anything

Preferred:

- `Repository added`
- `Failed to start session`
- `Changes saved`

Avoid:

- unnecessary celebration
- vague completion language
- over-explaining routine success

Toasts should support workflow, not interrupt it with personality.

## Settings Copy

Settings text should help the user make correct decisions quickly.

Rules:

- name the setting clearly
- keep descriptions short
- explain effect, not implementation trivia
- mention consequence when the setting changes behavior meaningfully

Good settings copy reduces guesswork and avoids tooltip dependency.

## Help and Secondary Text

Helper text should clarify, not duplicate.

Use helper text when it explains:

- a side effect
- a limitation
- a format requirement
- a non-obvious behavior

Avoid helper text that just paraphrases the label.

## Error Copy

Error messages should:

- describe the problem plainly
- avoid blaming the user by default
- state the next useful action when known
- stay technically credible

Preferred:

- `Authentication failed. Check your system credentials.`
- `Unable to load worktrees. Retry or check repository access.`

Avoid:

- vague failure messages with no direction
- emotional or apologetic filler
- unexplained jargon when plain wording is available

## Naming Consistency

Use the same term for the same concept across the product.

Examples:

- do not alternate casually between `repo` and `repository` in UI copy unless there is a clear intentional reason
- do not invent multiple status labels for the same runtime state
- do not rename the same workflow step in different panels

Terminology consistency improves both usability and trust.

## Do / Do Not

### Do

- write short, explicit labels
- make the next action obvious
- name destructive outcomes directly
- keep recurring status wording stable
- use empty states to guide action
- prefer operational clarity over personality

### Do Not

- write landing-page copy in product UI
- hide consequences behind soft language
- over-explain routine actions
- vary terminology casually
- use filler phrases that sound friendly but mean little
- let brevity collapse into ambiguity

## Review Checklist

Before shipping copy changes, check:

1. Is the wording explicit about action or state?
2. Can the user tell what happens next?
3. Is the copy shorter than a sentence when it should be?
4. Does destructive copy sound appropriately serious?
5. Is the wording consistent with existing product terminology?
6. Would this still scan well in a dense interface?
7. Does the copy sound like Infilux rather than generic SaaS software?

## Decision Priority

When copy choices conflict, resolve in this order:

1. clarity
2. consequence visibility
3. scanability
4. terminology consistency
5. tone polish
6. personality

## Relationship to Other Documents

- `agents/design-context.md` defines tone and product character
- `agents/interaction-patterns.md` defines what actions and flows copy must support
- `agents/accessibility-rules.md` defines readability and ambiguity constraints
- `agents/visual-review-checklist.md` defines how copy participates in visual hierarchy
- `docs/design-system.md` contains implementation-facing design rules
- this file defines how product UI copy should behave over time
