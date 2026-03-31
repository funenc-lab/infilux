# SEARCH COMPONENTS GUIDE

This directory owns global search UI, search result presentation, and search-specific interaction helpers.

This guide extends `src/renderer/components/AGENTS.md`.

## RESPONSIBILITIES

- Render search dialogs, result lists, and preview surfaces
- Keep search query behavior and result navigation cohesive

## RULES

- Search interactions should stay fast, incremental, and cancellation-friendly.
- Keep search-specific hooks or helpers close to the feature.
- Result rendering should preserve path clarity and preview context.

## ANTI-PATTERNS

- Mixing repository or editor ownership into search presentation
- Recomputing search result models separately in each component
