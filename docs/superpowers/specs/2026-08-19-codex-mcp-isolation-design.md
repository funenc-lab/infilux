# Codex MCP Isolation Design

## Goal

Prevent MCP servers copied from a user's historical Codex configuration from becoming implicit, application-wide MCP servers in Infilux sessions.

## Context

Infilux creates an application-owned provider configuration under `~/.infilux/provider-config/codex` and sets `CODEX_HOME` to that directory. The initial provider-scope seed copies `~/.codex/config.toml`, including `mcp_servers` entries. Individual session runtime homes link that file, so a stale MCP entry is inherited by every project session even when the current repository and resolved MCP policy do not contain it.

## Decision

The application-owned Codex configuration must not contain `mcp_servers` configuration. MCP discovery remains sourced from the user and workspace configuration catalogs; the existing Codex capability adapter is the only path that injects an allowed MCP into a session with explicit `-c mcp_servers.*` assignments.

## Design

`AppScopedProviderConfig` will gain a narrow TOML sanitization path for provider-scope files:

- A first-time Codex scope seed copies `config.toml` after removing all `mcp_servers` sections and top-level `mcp_servers` assignments.
- Every later initialization sanitizes the existing application-owned Codex `config.toml`, migrating older scopes without modifying the user's `~/.codex/config.toml`.
- The existing synchronization of `marketplaces` and `plugins` remains unchanged.
- The sanitizer operates on TOML section blocks, preserving unrelated root values, sections, comments, authentication, model configuration, marketplace configuration, and plugin configuration.

## Extension Points

The provider scope seed receives an optional list of TOML sections to exclude. This keeps provider-specific policy in the seed definition and allows another provider to opt into the same safety boundary without duplicating file-copy logic.

## Error Handling

Missing or unreadable files retain the current recoverable startup behavior. A malformed TOML file is treated as text: recognizable MCP section headers and assignments are removed, while unrelated content remains untouched. The source configuration is never changed.

## Verification

Tests will cover new-scope sanitization, migration of an existing scope, preservation of unrelated Codex configuration, and the absence of inherited MCP sections after initialization. Existing Codex runtime-home tests continue to verify that session homes inherit only the sanitized application-owned configuration.
