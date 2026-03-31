# REMOTE COMPONENTS GUIDE

This directory owns remote-specific renderer surfaces such as authentication prompts and remote status interactions.

This guide extends `src/renderer/components/AGENTS.md`.

## RESPONSIBILITIES

- Render remote-specific prompts or lightweight UI surfaces
- Keep remote workflow presentation isolated from generic repository UI

## RULES

- Remote UI should reflect explicit remote-state inputs from hooks or stores.
- Keep auth prompt behavior clear and interruption-safe.
- Avoid assuming remote flows behave like local-only flows.

## ANTI-PATTERNS

- Burying remote auth state machines in UI components
- Reusing local-only copy or assumptions in remote prompts
