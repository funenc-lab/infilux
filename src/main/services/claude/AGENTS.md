# CLAUDE INTEGRATION GUIDE

This directory owns Claude provider integration, prompts, plugins, MCP management, completions, and bridge behavior.

This guide extends `src/main/services/AGENTS.md`.

## RESPONSIBILITIES

- Coordinate Claude-facing provider and bridge capabilities
- Manage MCP servers, prompt presets, plugins, and completion-related flows
- Keep provider/runtime concerns separated by service rather than by feature flags inside one class

## RULES

- `ClaudeIdeBridge.ts` is a hotspot and should remain integration-focused.
- Separate provider management, prompt storage, plugin management, and MCP orchestration.
- Use shared types for all renderer-visible contracts.
- Keep filesystem and process side effects explicit and recoverable.

## ANTI-PATTERNS

- Collapsing provider, prompt, plugin, and bridge logic into a single service
- Returning loosely typed blobs to IPC callers
- Embedding renderer-specific settings presentation in main-process services
