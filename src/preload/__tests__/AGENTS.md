# PRELOAD TESTS GUIDE

This directory contains tests for preload bridge behavior and typed renderer-facing APIs.

This guide extends `src/preload/AGENTS.md`.

## RESPONSIBILITIES

- Verify bridge method shaping, event subscription cleanup, and type-safe exposure behavior
- Keep preload tests focused on bridging rather than business logic

## RULES

- Mock `ipcRenderer` behavior explicitly and assert exact subscription cleanup.
- Cover plain-object payload shaping and unsubscribe behavior for push events.

## ANTI-PATTERNS

- Duplicating main-process business logic in preload tests
- Exposing raw Electron APIs just because they are easy to assert
