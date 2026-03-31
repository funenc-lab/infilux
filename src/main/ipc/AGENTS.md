# IPC DIRECTORY GUIDE

This directory owns main-process IPC handler registration, sender-scoped subscriptions, and renderer-facing request boundaries.

This guide extends `src/main/AGENTS.md` and the root `AGENTS.md`.

## RESPONSIBILITIES

- Group handlers by domain instead of growing `index.ts`
- Validate renderer payload shape before delegating
- Translate service results into explicit, serializable IPC responses
- Bind and release sender-scoped listeners, watchers, and subscriptions

## DESIGN RULES

- Keep handlers thin. Business logic belongs in `src/main/services/`.
- Register each domain module through `src/main/ipc/index.ts`.
- Prefer object payloads once a handler has more than one meaningful argument.
- Return stable payload contracts that match `src/shared/types/ipc.ts`.
- Cleanup must be tied to `webContents` or window lifetime when subscriptions are involved.

## HOTSPOTS

- `files.ts` must preserve both local-path and remote-virtual-path behavior.
- `agent*.ts` should coordinate agent/session flows without taking over service responsibilities.
- `webInspector.ts` and other process-bridge handlers are lifecycle-sensitive and should stay explicit.

## ANTI-PATTERNS

- Doing repository, filesystem, or process orchestration directly inside handlers
- Returning ad hoc shapes that drift from shared contracts
- Registering listeners without a matching teardown path
- Reaching into renderer concerns from main-process handlers
