## Context

The terminal service currently owns PTY lifecycle directly. This change adds a Windows-only transport adapter while preserving session ownership and the renderer terminal interface.

## Goals / Non-Goals

**Goals:** isolate Windows PTY failures, make backend choice explicit, and guarantee process cleanup.

**Non-Goals:** changing shell selection, terminal persistence, remote PTY transport, or terminal UI.

## Decisions

Create `WindowsPtyHelper` under `src/main/services/terminal/` with a typed protocol to a forked helper process. `PtyManager` selects it only on Windows and remains the owner of session-facing PTY handles. Shared types expose diagnostics, not helper control objects.

Use OS build capability for ConPTY selection and WinPTY fallback. Package the helper as an unpacked runtime asset. Adding Windows conditionals throughout `PtyManager` is rejected because it couples native-process failures to every lifecycle branch.

## Risks / Trade-offs

- Helper packaging mismatch → packaging tests verify development and asar-unpacked resolution.
- Duplicate exit events → the helper adapter owns one-shot exit delivery.
- Failed process-tree kill → timeout returns a recoverable failure and records diagnostics.

## Migration Plan

Ship behind the existing Windows code path, validate on supported Windows builds, and roll back by selecting the current direct transport without changing renderer or session contracts.
