# CLAUDE PROVIDER SETTINGS GUIDE

This directory owns provider-list and provider-dialog UI for Claude-related settings.

This guide extends `src/renderer/components/settings/AGENTS.md`.

## RESPONSIBILITIES

- Render provider selection and provider editing flows
- Keep Claude provider configuration UI isolated from unrelated settings sections

## RULES

- Provider forms should work from explicit settings models and actions.
- Provider list display and dialog editing should stay decoupled.
- Avoid embedding provider persistence or validation rules that belong in stores or shared models.

## ANTI-PATTERNS

- Mixing provider UI with MCP, plugin, or prompt configuration behavior
- Hiding provider identity or enablement rules inside generic dialog helpers
