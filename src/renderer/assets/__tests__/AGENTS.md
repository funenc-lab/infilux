# RENDERER ASSETS TESTS GUIDE

This directory contains tests for renderer asset references and asset-adjacent behavior.

This guide extends `src/renderer/assets/AGENTS.md`.

## RESPONSIBILITIES

- Verify asset reference integrity where tests exist
- Keep asset-specific coverage narrow and consumer-oriented

## RULES

- Assert the intended asset contract or lookup behavior, not pixel-perfect rendering.
- Keep asset tests stable and free of unnecessary UI coupling.

## ANTI-PATTERNS

- Treating asset tests as visual snapshot suites without purpose
- Hiding asset provenance assumptions in opaque fixtures
