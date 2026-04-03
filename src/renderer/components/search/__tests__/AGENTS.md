# SEARCH COMPONENTS TESTS GUIDE

This directory contains tests for global search UI and search-result behavior.

This guide extends `src/renderer/components/search/AGENTS.md`.

## RESPONSIBILITIES

- Verify query interaction, result rendering, and preview/navigation behavior
- Keep search-specific coverage cohesive and cancellation-aware

## RULES

- Assert path clarity, result context, and user-visible search behavior.
- Use explicit result fixtures and controlled search-state setup.

## ANTI-PATTERNS

- Recomputing search models independently inside tests
- Mixing editor ownership or repository selection behavior into search-only suites
