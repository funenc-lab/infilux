## Context

Infilux owns session identity in main services and task state in existing stores and services. A second renderer must not become another authority or receive state through renderer-to-renderer relaying.

## Goals / Non-Goals

**Goals:** provide a lightweight monitor, safe focus navigation, and deterministic window cleanup.

**Non-Goals:** editing tasks from the companion, duplicating AI Center, or retaining stale session data.

## Decisions

Create a main-process `RunningAgentProjectionService` that composes existing session and task authorities into a serializable snapshot. A dedicated window module owns BrowserWindow lifecycle and sender-scoped subscriptions. The companion renderer renders snapshots and requests navigation; the main window is the only surface that switches worktrees and selects sessions.

Forwarding a Zustand store snapshot from the main renderer is rejected because it creates lifecycle coupling between renderer processes and loses authority after main-window reload.

## Risks / Trade-offs

- Projection drift → subscribe to authoritative lifecycle events and refresh on window show.
- Window leaks → tie subscriptions to webContents destruction and app shutdown.
- Navigation race → validate target existence at request time.

## Migration Plan

Ship behind an explicit menu action, preserve AI Center, and roll back by removing the menu action and window registration without altering task or session persistence.
