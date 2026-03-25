# SHARED MODULE GUIDE

The shared layer contains cross-process types, channel contracts, and pure utilities that can be safely consumed by both main and renderer.

This guide extends, and does not replace, the root `AGENTS.md`.

## RESPONSIBILITIES

- Define IPC channel names and cross-process payload contracts
- Provide stable domain type definitions
- Host pure utilities that do not depend on Electron runtime globals
- Serve as the contract boundary across main, preload, and renderer

## WHAT BELONGS HERE

- Domain interfaces and type aliases used by more than one process
- IPC channel constants in `src/shared/types/ipc.ts`
- Pure path, workspace, file-url, or remote-path-adjacent helpers that stay runtime-agnostic
- Small branding or i18n definitions that must be shared across processes

## WHAT DOES NOT BELONG HERE

- Electron-specific code
- Renderer hooks or UI utilities
- Main-process service orchestration
- Hidden mutable singletons tied to one process runtime

## DEPENDENCY DIRECTION RULES

- `src/shared/` must not import from `src/main/`.
- `src/shared/` must not import from `src/renderer/`.
- `src/shared/` must not import from `src/preload/`.
- Keep dependency direction flowing outward from shared contracts, not back into process-specific implementations.

## CONTRACT RULES

- Treat `src/shared/types/ipc.ts` as the canonical IPC vocabulary.
- Prefer explicit payload types over loosely typed blobs.
- Keep exported types cohesive by domain (`git`, `remote`, `session`, `terminal`, and so on).
- Re-export only intentionally public types from `src/shared/types/index.ts`.

## CHANGE MANAGEMENT

When changing a shared contract:
1. Update the shared type or channel definition.
2. Update main-process handlers and return types.
3. Update preload bridge signatures.
4. Update renderer consumers.
5. Run verification to catch contract drift.

## WHERE TO LOOK

| Task | Primary location | Notes |
|------|------------------|-------|
| IPC channel constants | `src/shared/types/ipc.ts` | Cross-process source of truth |
| Domain payload types | `src/shared/types/*.ts` | Keep domains focused |
| Shared exports | `src/shared/types/index.ts` | Public barrel for types |
| Pure utilities | `src/shared/utils/` | Must stay process-agnostic |
| Shared branding/i18n | `src/shared/branding.ts`, `src/shared/i18n.ts` | Used by multiple layers |

## ANTI-PATTERNS

- Importing Electron, browser globals, or Node-only runtime assumptions into shared utilities without necessity
- Creating vague `Record<string, unknown>` contracts when a clear interface is possible
- Importing process-specific modules from `src/main/`, `src/renderer/`, or `src/preload/`
- Coupling shared helpers to one process's lifecycle or service container
- Letting barrel exports become a dumping ground for unrelated internals
