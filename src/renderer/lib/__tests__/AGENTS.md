# RENDERER LIB TESTS GUIDE

This directory contains tests for renderer-only utility, model, and helper modules.

This guide extends `src/renderer/lib/AGENTS.md`.

## RESPONSIBILITIES

- Verify pure derivation logic, model helpers, and renderer-only policies
- Keep helper behavior deterministic and easy to reason about through focused tests
- Catch drift in theme, copy, diagnostics, and model-shaping helpers

## RULES

- Prefer pure input/output tests with minimal mocking.
- If a helper has explicit bridge or environment dependencies, make them obvious in setup.
- Keep tests aligned with the helper's responsibility instead of asserting several unrelated behaviors together.

## ANTI-PATTERNS

- Treating `lib` tests as a fallback for feature integration coverage
- Hiding store or Electron dependencies behind generic helper fixtures
- Asserting unrelated behavior from one broad helper test
