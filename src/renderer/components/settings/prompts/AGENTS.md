# PROMPT SETTINGS GUIDE

This directory owns prompt preset management and prompt editing dialogs.

This guide extends `src/renderer/components/settings/AGENTS.md`.

## RESPONSIBILITIES

- Render prompt preset lists and prompt editor flows
- Keep prompt-management UI isolated from provider or plugin management

## RULES

- Prompt editing should preserve clear draft, save, and discard behavior.
- Prompt list and prompt editor concerns should stay separated.
- Avoid embedding prompt storage or migration logic in components.

## ANTI-PATTERNS

- Mixing prompt authoring with provider configuration behavior
- Hiding prompt identity or scope in generic dialog copy
