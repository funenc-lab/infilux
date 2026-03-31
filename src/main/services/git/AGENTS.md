# GIT SERVICES GUIDE

This directory owns Git commands, worktree operations, safe-directory handling, and Git runtime helpers.

This guide extends `src/main/services/AGENTS.md`.

## RESPONSIBILITIES

- Encapsulate repository discovery and Git command execution
- Manage worktree creation, listing, switching, and cleanup support
- Apply safe-directory and environment rules consistently

## RULES

- Keep repository boundaries explicit and validated.
- Prefer dedicated helpers for encoding, runtime, and log-format policies instead of inlining them repeatedly.
- Return normalized domain results rather than raw CLI output when possible.
- Preserve compatibility with both local and remote-aware repository workflows where applicable.

## ANTI-PATTERNS

- Spreading Git executable discovery logic across unrelated services
- Returning fragile string parsing results directly to renderer code
- Mixing source-control UI concepts into Git domain services
