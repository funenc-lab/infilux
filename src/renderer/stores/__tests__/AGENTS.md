# RENDERER STORES TESTS GUIDE

This directory contains tests for Zustand store ownership, actions, and state transitions.

This guide extends `src/renderer/stores/AGENTS.md`.

## RESPONSIBILITIES

- Verify store ownership boundaries, explicit actions, and state transitions
- Cover persisted, ephemeral, and runtime-only state with clear separation
- Keep cross-store coordination visible when a store action depends on another slice

## RULES

- Assert store state transitions and derived behavior through public actions.
- Reset store state explicitly between tests.
- Cover ownership-sensitive flows where parallel state sources would cause regressions.

## ANTI-PATTERNS

- Sharing dirty store state across tests
- Asserting component markup from a store suite
- Encoding UI-only derivations as fixed store snapshots without need
