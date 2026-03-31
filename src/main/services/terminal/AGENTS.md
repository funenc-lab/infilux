# TERMINAL SERVICES GUIDE

This directory owns shell detection and PTY lifecycle management.

This guide extends `src/main/services/AGENTS.md`.

## RESPONSIBILITIES

- Create, resize, stream, and destroy PTY-backed terminals
- Detect shell/runtime launch details needed for terminal sessions
- Provide a narrow, explicit terminal transport layer for session services

## RULES

- Keep PTY ownership and cleanup deterministic.
- Stream transport should stay transport-focused, not session-aware.
- Shell detection must be platform-aware and explicit about fallbacks.
- Surface terminal failures in a way higher layers can recover from or report.

## ANTI-PATTERNS

- Embedding session persistence logic in PTY management
- Hiding shell selection behind magic defaults without clear precedence
- Forgetting to destroy PTYs on shutdown or detach
