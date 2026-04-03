# MCP SETTINGS TESTS GUIDE

This directory contains tests for MCP settings UI behavior.

This guide extends `src/renderer/components/settings/mcp/AGENTS.md`.

## RESPONSIBILITIES

- Verify MCP server editing, summaries, and section-level behavior
- Keep MCP configuration coverage separate from provider and plugin settings

## RULES

- Assert explicit field behavior, validation, and readable section summaries.
- Use focused settings fixtures for MCP server state.

## ANTI-PATTERNS

- Mixing plugin marketplace or provider behavior into MCP suites
- Hiding server-validation assumptions in unrelated helpers
