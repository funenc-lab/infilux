# MAIN UTILS GUIDE

This directory contains small, reusable helpers for the main process only.

This guide extends `src/main/AGENTS.md`.

## RESPONSIBILITIES

- Provide focused helpers for logging, process handling, shell environment setup, and crash recovery support
- Stay lightweight enough that consumers remain readable

## RULES

- Utilities here should be process-specific but domain-neutral.
- Keep helpers small and explicit; move stateful logic back into a service if it grows.
- Avoid creating hidden dependency containers or singleton service registries here.

## ANTI-PATTERNS

- Turning `utils/` into a dumping ground for unrelated business logic
- Hiding irreversible side effects behind names that look pure
- Re-implementing helpers that already exist in shared or domain services
