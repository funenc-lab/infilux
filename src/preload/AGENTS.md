# PRELOAD GUIDE

The preload layer is the security and contract boundary between renderer code and privileged Electron/main-process capabilities.

This guide extends, and does not replace, the root `AGENTS.md`.

## RESPONSIBILITIES

- Expose a typed `window.electronAPI` surface to the renderer
- Translate renderer calls into IPC requests and event subscriptions
- Keep the bridge explicit, serializable, and safe
- Avoid leaking unnecessary Electron or Node APIs into renderer space

## CORE RULES

- Renderer code should use `window.electronAPI`, not direct Electron imports.
- Every new bridge method should map to an existing shared IPC contract and main handler.
- Keep bridge method names grouped by domain (`git`, `files`, `session`, `remote`, and so on).
- Return unsubscribe functions for push-event subscriptions.
- Do not put business logic in preload. Preload is a bridge, not an orchestration layer.
- Do not expose generic pass-through primitives such as raw `ipcRenderer`, raw `shell`, raw filesystem/process helpers, or a catch-all `invoke(channel, ...args)` API.

## EXTENSION PATH

```text
src/shared/types/ipc.ts
  -> src/main/ipc/<domain>.ts
    -> src/preload/index.ts
      -> renderer consumer
```

When adding a new preload API:
1. Add or update the shared channel/type contract.
2. Implement the handler in main.
3. Expose a typed bridge function in `src/preload/index.ts`.
4. Update or preserve the exported `ElectronAPI` type.
5. Consume it from renderer code.

## SUBSCRIPTION RULES

For `ipcRenderer.on(...)` usage:
- Scope the handler to one domain event.
- Return a cleanup function that removes the exact listener.
- Avoid anonymous patterns that are hard to unsubscribe correctly.

## PATH AND PAYLOAD RULES

- Use plain objects and serializable payloads.
- Prefer explicit option objects when arguments become non-trivial.
- Preserve local-path and remote-virtual-path support where the underlying main handler supports both.

## WHERE TO LOOK

| Task | File | Notes |
|------|------|-------|
| Extend bridge surface | `src/preload/index.ts` | Main preload entry point |
| Global renderer typing | `src/preload/types.ts` | Declares `window.electronAPI` |
| IPC channel constants | `src/shared/types/ipc.ts` | Keep contracts aligned |
| Shared domain types | `src/shared/types/` | Prefer reusing existing payload types |

## ANTI-PATTERNS

- Exposing raw Electron modules to renderer code
- Exposing generic pass-through primitives instead of scoped domain methods
- Duplicating business logic in preload and main
- Adding bridge APIs without updating shared contracts
- Forgetting to return cleanup functions for event subscriptions
- Smuggling renderer-only concerns into preload
