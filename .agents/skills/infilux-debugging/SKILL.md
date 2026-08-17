---
name: infilux-debugging
description: Use when debugging Infilux main-process, preload, IPC, renderer, remote-runtime, or session lifecycle issues and you need a repeatable evidence-gathering workflow tied to this repository.
---

# Infilux Debugging

## Overview

Debug Infilux by collecting evidence in a fixed order:

1. Reproduce the issue.
2. Capture the current diagnostics bundle.
3. Trace the failing boundary.
4. Fix the root cause, not the symptom.

This skill is repository-specific. It assumes the project layout and runtime model documented in `AGENTS.md`.

## When to Use

- Renderer white screen, crash, or unresponsive state
- Main-process startup failure or cleanup crash
- IPC requests failing between renderer and main
- Remote connection or remote runtime failures
- Agent session restore, reconcile, or terminal lifecycle issues
- Settings, shared state, or persistent session corruption

## Quick Start

From the repository root:

```bash
pnpm diagnostics:collect
```

Optional overrides:

```bash
pnpm diagnostics:collect -- --output-dir .tmp/diagnostics/manual --tail-lines 400
pnpm diagnostics:collect -- --log-dir ~/Library/Logs/Infilux
```

The script writes a diagnostics directory containing:

- `manifest.json`
- `logs/`
- `shared-state/settings.json`
- `shared-state/session-state.json`
- `repo/head.txt`
- `repo/status.txt`

## Evidence Order

1. Check the Settings screen for `Current Log File` and `Recent Log Output`.
2. Run `pnpm diagnostics:collect` to freeze current evidence before changing code.
3. Identify the failing boundary:
   - renderer -> preload
   - preload -> IPC
   - IPC -> main service
   - main service -> native/runtime
4. Open the closest owner files first:
   - main logging and diagnostics: `src/main/utils/logger.ts`, `src/main/ipc/log.ts`
   - preload bridge: `src/preload/index.ts`
   - renderer settings and diagnostics UI: `src/renderer/components/settings/GeneralSettings.tsx`
   - shared contracts: `src/shared/types/ipc.ts`, `src/shared/types/log.ts`

## Boundary Checks

### Renderer

- Look for `window error`, `unhandledrejection`, and error-boundary entries.
- Compare UI state with `Recent Log Output`.
- Confirm whether the renderer actually sent the IPC request you expect.

### Preload / IPC

- Verify the IPC channel exists in `src/shared/types/ipc.ts`.
- Verify preload exposes the same payload shape as main expects.
- Verify main handlers return serializable payloads.

### Main Process

- Check startup logs, cleanup logs, and renderer-recovery logs first.
- Confirm whether the failure happens before or after `initLogger()`.
- Prefer service-level root cause analysis over adding more `console.log`.

### Remote / Session Lifecycle

- Inspect remote diagnostics in `RemoteConnectionManager`.
- Check persistent session state and host session keys before assuming data loss.
- Treat recovery failures as state machine bugs until proven otherwise.

## Tooling

- Diagnostics bundle: `pnpm diagnostics:collect`
- Targeted tests:

```bash
pnpm vitest run <path-to-focused-test>
```

- Type contract verification:

```bash
pnpm typecheck
```

## Common Mistakes

- Reading only one layer of logs and assuming the cause is local
- Fixing renderer symptoms when the IPC contract is wrong
- Changing session recovery logic without capturing shared state first
- Treating missing logs as “no issue” instead of “logging path failed”

## Output Standard

When reporting a debug result, include:

- reproduction steps
- failing boundary
- relevant log snippet
- diagnostics bundle path
- root cause hypothesis
- verification command and result
