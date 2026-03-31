# PLUGIN SETTINGS GUIDE

This directory owns plugin browsing, marketplace dialogs, and plugin management UI.

This guide extends `src/renderer/components/settings/AGENTS.md`.

## RESPONSIBILITIES

- Render plugin discovery and plugin management surfaces
- Keep marketplace and browser flows grouped under the plugin settings domain

## RULES

- Plugin browsing and installed-plugin management should remain clearly separated in the UI.
- Dialogs should make marketplace source and plugin actions explicit.
- Keep network or install-side effects outside the component layer when possible.

## ANTI-PATTERNS

- Mixing plugin configuration with prompt or MCP settings
- Hiding plugin source, status, or install impact behind vague labels
