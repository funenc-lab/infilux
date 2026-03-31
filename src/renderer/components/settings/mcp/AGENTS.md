# MCP SETTINGS GUIDE

This directory owns MCP server configuration UI inside settings.

This guide extends `src/renderer/components/settings/AGENTS.md`.

## RESPONSIBILITIES

- Render MCP section surfaces and server editing dialogs
- Keep MCP configuration flows modular and separate from other integration settings

## RULES

- Server editing should rely on explicit field models and settings actions.
- Section-level summaries should stay readable for multiple configured servers.
- Keep provider-independent MCP behavior separate from Claude-provider-specific UI.

## ANTI-PATTERNS

- Mixing plugin marketplace logic into MCP settings
- Burying server validation or status semantics in unrelated settings components
