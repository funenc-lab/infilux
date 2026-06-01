# TOKEN USAGE SERVICES GUIDE

This directory owns main-process token usage collection, aggregation, caching, and provider adapters.

This guide extends `src/main/services/AGENTS.md`.

## RESPONSIBILITIES

- Collect token usage from supported agent providers and expose project-scoped snapshots
- Keep provider log parsing isolated behind adapter interfaces
- Aggregate usage into stable shared contracts for renderer display and IPC events
- Cache scans and emit update events without blocking the app on repeated filesystem work

## RULES

- Keep provider-specific log discovery and parsing inside adapter classes.
- Keep aggregation, freshness metadata, and request normalization separate from adapter parsing.
- Treat missing, corrupt, partial, or unsupported provider data as recoverable status, not a service crash.
- Return serializable shared types only; UI wording and formatting belong in renderer components.
- Preserve request scoping by project, worktree, provider, and agent family when adding filters.
- Avoid synchronous deep scans outside narrowly bounded file reads that are already covered by tests.

## EXTENSION POINTS

- Add a new `TokenUsageAdapter` when a provider has a stable local usage source.
- Extend `TokenUsageScope` or shared token usage utilities when a new scoping dimension affects all providers.
- Add static unsupported adapters when the UI needs explicit status for known providers without trusted data.

## TESTING FOCUS

- Cover adapter parsing with representative log fixtures, malformed files, and empty directories.
- Cover cache freshness, background refresh, event emission, and request-key normalization.
- Verify aggregation semantics for overlapping sessions, provider statuses, and scoped requests.

## ANTI-PATTERNS

- Mixing UI labels, colors, or component-specific grouping into service results
- Reading arbitrary provider directories without clear bounds or error isolation
- Treating unsupported providers as zero usage when the correct state is unknown or unavailable
- Adding token usage state to unrelated session, terminal, or agent registry services
