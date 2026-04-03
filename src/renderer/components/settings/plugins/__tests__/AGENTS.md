# PLUGIN SETTINGS TESTS GUIDE

This directory contains tests for plugin-management and marketplace UI behavior.

This guide extends `src/renderer/components/settings/plugins/AGENTS.md`.

## RESPONSIBILITIES

- Verify plugin browsing, source clarity, install/remove actions, and dialog behavior
- Keep plugin settings coverage distinct from prompt and MCP flows

## RULES

- Assert marketplace source, plugin status, and action visibility explicitly.
- Use controlled fixtures for installed and discoverable plugin state.

## ANTI-PATTERNS

- Hiding plugin source or status behind broad snapshots
- Mixing unrelated settings domains into plugin suites
