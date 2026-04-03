# PROMPT SETTINGS TESTS GUIDE

This directory contains tests for prompt preset and prompt editor UI behavior.

This guide extends `src/renderer/components/settings/prompts/AGENTS.md`.

## RESPONSIBILITIES

- Verify prompt list, editor, draft, save, and discard behavior
- Keep prompt-management coverage isolated from provider and plugin settings

## RULES

- Assert prompt identity, scope, and explicit draft transitions.
- Use focused prompt fixtures and settings actions.

## ANTI-PATTERNS

- Mixing provider configuration behavior into prompt suites
- Hiding prompt scope or draft behavior in opaque snapshots
