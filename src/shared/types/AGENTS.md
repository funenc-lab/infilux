# SHARED TYPES GUIDE

This directory contains shared domain types and IPC-facing payload contracts.

This guide extends `src/shared/AGENTS.md`.

## RESPONSIBILITIES

- Define stable cross-process domain types
- Group exported types by domain instead of creating generic catch-all files
- Keep `ipc.ts` as the canonical channel vocabulary

## OWNERSHIP RULES

- Put a type in the domain file that best matches the business concept, not the first consumer that needs it.
- Keep IPC channels, request payloads, and response payloads explicit enough that main, preload, and renderer can evolve together.
- Prefer serializable payload contracts over rich runtime objects or environment-specific abstractions.

## RULES

- Favor explicit interfaces and discriminated unions over vague bags of data.
- Keep type ownership close to the domain name that consumes it.
- Re-export only intentionally public types from `index.ts`.
- When changing a type here, update all affected main, preload, and renderer call sites together.
- Keep request, response, event, and error shapes distinguishable when the same domain exposes several IPC operations.
- Add compatibility fields deliberately and document deprecation pressure in the surrounding code when needed.

## EXTENSION POINTS

- Add a new domain type file when the concept is reusable across process boundaries and does not fit an existing domain cleanly.
- Extract shared payload fragments only after at least two contracts genuinely reuse the same structure.
- Keep `ipc.ts` focused on channel vocabulary and import richer payload types from domain files as contracts grow.

## TESTING FOCUS

- Cover schema-like helpers and compatibility behavior with targeted tests where drift risk is high.
- Prefer compile-time usage and explicit contract assertions over opaque fixture blobs.

## ANTI-PATTERNS

- Using `Record<string, unknown>` when the structure is known
- Creating circular dependencies between type files
- Letting compatibility exports hide drift in the real contract
- Encoding renderer-only or main-only assumptions into shared payload names
