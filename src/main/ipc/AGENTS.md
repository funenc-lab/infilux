# IPC DIRECTORY GUIDE

This directory owns main-process IPC handler registration, sender-scoped subscriptions, and renderer-facing request boundaries.

This guide extends `src/main/AGENTS.md` and the root `AGENTS.md`.

## RESPONSIBILITIES

- Group handlers by domain instead of growing `index.ts`
- Validate renderer payload shape before delegating
- Translate service results into explicit, serializable IPC responses
- Bind and release sender-scoped listeners, watchers, and subscriptions

## CANONICAL FLOW

```text
src/shared/types/ipc.ts
  -> src/main/ipc/<domain>.ts
    -> src/preload/index.ts
      -> renderer consumer
```

Treat IPC changes as cross-layer contract work, not local handler edits.

## DESIGN RULES

- Keep handlers thin. Business logic belongs in `src/main/services/`.
- Register each domain module through `src/main/ipc/index.ts`.
- Prefer object payloads once a handler has more than one meaningful argument.
- Return stable payload contracts that match `src/shared/types/ipc.ts`.
- Cleanup must be tied to `webContents` or window lifetime when subscriptions are involved.
- When adding or changing a channel, update shared contracts, main handlers, preload bridge methods, and renderer call sites together.
- Keep push-event naming, subscribe/unsubscribe behavior, and sender ownership explicit instead of hiding them behind generic helpers.
- Prefer explicit error payloads or well-scoped thrown errors over loosely shaped failure objects.

## EXTENSION POINTS

- Add a new IPC module when a capability has distinct lifecycle, payload, or cleanup rules.
- Extract domain-specific argument normalization helpers when several handlers in one file share the same shaping rules.
- Add focused test helpers for fake `webContents`, sender cleanup, and subscription teardown rather than duplicating setup across suites.

## HOTSPOTS

- `files.ts` must preserve both local-path and remote-virtual-path behavior.
- `agent*.ts` should coordinate agent/session flows without taking over service responsibilities.
- `webInspector.ts` and other process-bridge handlers are lifecycle-sensitive and should stay explicit.
- `index.ts` is the registration choke point and must remain easy to audit.

## TESTING FOCUS

- Verify both request-response shaping and sender-scoped cleanup behavior.
- Cover lifecycle-sensitive handlers with explicit teardown assertions.
- Prefer contract-level assertions over snapshots of incidental object shape.

## ANTI-PATTERNS

- Doing repository, filesystem, or process orchestration directly inside handlers
- Returning ad hoc shapes that drift from shared contracts
- Registering listeners without a matching teardown path
- Reaching into renderer concerns from main-process handlers
- Changing one IPC layer while assuming another layer will be updated later
