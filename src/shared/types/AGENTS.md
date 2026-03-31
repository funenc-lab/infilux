# SHARED TYPES GUIDE

This directory contains shared domain types and IPC-facing payload contracts.

This guide extends `src/shared/AGENTS.md`.

## RESPONSIBILITIES

- Define stable cross-process domain types
- Group exported types by domain instead of creating generic catch-all files
- Keep `ipc.ts` as the canonical channel vocabulary

## RULES

- Favor explicit interfaces and discriminated unions over vague bags of data.
- Keep type ownership close to the domain name that consumes it.
- Re-export only intentionally public types from `index.ts`.
- When changing a type here, update all affected main, preload, and renderer call sites together.

## ANTI-PATTERNS

- Using `Record<string, unknown>` when the structure is known
- Creating circular dependencies between type files
- Letting compatibility exports hide drift in the real contract
