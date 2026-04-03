# SHARED UTILS TESTS GUIDE

This directory contains tests for process-agnostic shared utility helpers.

This guide extends `src/shared/utils/AGENTS.md`.

## RESPONSIBILITIES

- Verify pure helper behavior for paths, file URLs, diagnostics, remote paths, and workspace metadata
- Keep shared utility behavior deterministic across process boundaries
- Catch compatibility drift in helpers that encode shared conventions

## RULES

- Prefer pure input/output assertions with explicit fixtures.
- Cover edge cases that affect both main and renderer consumers.
- Keep runtime-specific assumptions out of shared utility tests unless the helper contract documents them.

## ANTI-PATTERNS

- Burying process-specific behavior in shared utility fixtures
- Depending on DOM, Electron, or machine-specific state by accident
- Repeating the same path or remote-path expectations across many brittle snapshots
