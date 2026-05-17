# AGENT PROVIDER SERVICES GUIDE

This directory owns main-process discovery, parsing, writing, and watching of agent provider configuration.

This guide extends `src/main/services/AGENTS.md`.

## RESPONSIBILITIES

- Read and write supported provider configuration for Codex, Cursor, Gemini, and future CLI-backed agents
- Convert provider-specific config files into shared `AgentProviderProfile` domain data
- Watch provider settings files and publish explicit change events to renderer windows
- Support both local paths and remote repository environment contexts where the provider manager requires them

## RULES

- Keep provider-specific parsing and serialization inside the matching provider manager.
- Keep `AgentProviderSettingsWatcher` generic; provider-specific detection belongs in provider managers.
- Treat malformed, missing, or partially written config files as recoverable states.
- Close file watchers and timers through explicit lifecycle methods when windows are destroyed or services stop.
- Do not return renderer-shaped labels or layout state from this service layer.
- Keep auth tokens and config paths out of logs unless the value is intentionally redacted.

## EXTENSION POINTS

- Add a provider manager when a new agent has its own config file, environment variables, or profile extraction rules.
- Extend the watcher through typed options instead of adding provider branches to the watcher itself.
- Add remote read/write support only through existing remote environment service boundaries.

## TESTING FOCUS

- Use fake config directories and injected environment values for provider parsing tests.
- Cover missing files, invalid syntax, comment handling, provider detection, write preservation, and watcher debounce behavior.
- Verify that sensitive values are preserved or redacted exactly as intended.

## ANTI-PATTERNS

- Sharing mutable parser state between provider managers
- Emitting IPC events directly from ad hoc file-system callbacks without debounce and window checks
- Hardcoding home-directory paths where environment overrides or remote contexts are required
- Swallowing parse errors in a way that hides an unsupported or corrupted provider state from callers
