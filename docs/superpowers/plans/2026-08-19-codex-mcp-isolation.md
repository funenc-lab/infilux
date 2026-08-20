# Codex MCP Isolation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure Infilux Codex sessions receive MCP servers only through explicit capability-policy projection and never from stale application-scoped provider configuration.

**Architecture:** Add section-aware TOML sanitization to the app-scoped provider seed. Codex opts into exclusion of `mcp_servers`, applying it both when copying the original configuration and when migrating an existing private configuration. The existing Codex adapter continues to inject policy-approved MCPs through command-line overrides.

**Tech Stack:** TypeScript, Node.js file APIs, Vitest.

## Global Constraints

- Keep source code and comments in English.
- Do not modify the user's global `~/.codex/config.toml`.
- Preserve unrelated Codex configuration and existing plugin/marketplace synchronization.
- Use `pnpm` for verification.

---

### Task 1: Add failing provider-scope isolation tests

**Files:**

- Modify: `src/main/services/agentProvider/__tests__/AppScopedProviderConfig.test.ts`
- Test: `src/main/services/agentProvider/__tests__/AppScopedProviderConfig.test.ts`

**Interfaces:**

- Consumes: `initializeAppScopedProviderConfig(options)`
- Produces: explicit regression coverage for first-time seeds and legacy scoped-config migration.

- [x] **Step 1: Add a failing first-time seed test**

Create a user Codex config with a model setting, a marketplace section, and `[mcp_servers.penpad]`. Initialize the provider scope and assert that the app-scoped config retains the model and marketplace but has no `mcp_servers` content.

- [x] **Step 2: Add a failing existing-scope migration test**

Create an initialized app-scoped Codex directory containing a legacy `[mcp_servers.penpad]` section and a non-MCP setting. Initialize again and assert the legacy MCP block is removed, the non-MCP setting remains, and the original user config remains unchanged.

- [x] **Step 3: Run the focused test file to verify failure**

Run: `pnpm vitest run src/main/services/agentProvider/__tests__/AppScopedProviderConfig.test.ts`

Expected: the new assertions fail because the current implementation copies and retains `mcp_servers` sections.

### Task 2: Sanitize excluded TOML configuration sections

**Files:**

- Modify: `src/main/services/agentProvider/AppScopedProviderConfig.ts`
- Test: `src/main/services/agentProvider/__tests__/AppScopedProviderConfig.test.ts`

**Interfaces:**

- Consumes: `ProviderScopeSeed.files`, `ProviderScopeSeed.synchronizedTomlSections`, and the existing TOML section-block helpers.
- Produces: an optional provider-scope TOML exclusion list applied to copied and existing scoped files.

- [x] **Step 1: Extend the seed model with excluded TOML sections**

Add an optional `excludedTomlSections` property to `ProviderScopeSeed`. Configure the Codex seed with `['mcp_servers']`; leave the Claude and Gemini seeds unchanged.

- [x] **Step 2: Implement a text-preserving TOML sanitizer**

Use the existing section-block parser to remove matching table blocks. Filter matching root-level assignments such as `mcp_servers = ...` and `mcp_servers.penpad.command = ...` so both table and dotted-key forms are excluded.

- [x] **Step 3: Apply sanitization to first-time copies and existing scoped configs**

Copy `config.toml` through the sanitizer when the target does not exist. On every successful scope initialization, sanitize the target file after marketplace/plugin synchronization so old scopes are migrated and no later synchronization can restore excluded sections.

- [x] **Step 4: Run the focused test file to verify success**

Run: `pnpm vitest run src/main/services/agentProvider/__tests__/AppScopedProviderConfig.test.ts`

Expected: all tests pass, including both new isolation regressions.

### Task 3: Verify session-level behavior and quality gates

**Files:**

- Test: `src/main/services/agentProvider/__tests__/AppScopedProviderConfig.test.ts`
- Test: `src/main/services/agent/__tests__/CodexRuntimeHomeService.test.ts`

**Interfaces:**

- Consumes: the sanitized app-scoped Codex `config.toml` linked by `CodexRuntimeHomeService`.
- Produces: evidence that new sessions cannot inherit stale MCP configuration through `CODEX_HOME`.

- [x] **Step 1: Run provider-scope and runtime-home tests together**

Run: `pnpm vitest run src/main/services/agentProvider/__tests__/AppScopedProviderConfig.test.ts src/main/services/agent/__tests__/CodexRuntimeHomeService.test.ts`

Expected: all tests pass.

- [x] **Step 2: Run type checking**

Run: `pnpm typecheck`

Expected: exit code 0.

- [ ] **Step 3: Run linting**

Run: `pnpm lint`

Expected: exit code 0.

Result: the scoped files pass Biome and the remaining lint quality checks pass. The full command is blocked only by formatting in the generated, user-owned `.launch-code/state.json`, which is outside this change.

- [x] **Step 4: Inspect the final diff**

Run: `git diff -- src/main/services/agentProvider/AppScopedProviderConfig.ts src/main/services/agentProvider/__tests__/AppScopedProviderConfig.test.ts`

Expected: only scoped-config MCP isolation logic and its targeted tests are present.
