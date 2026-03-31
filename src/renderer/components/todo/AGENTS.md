# TODO COMPONENTS GUIDE

This directory owns the todo panel, kanban presentation, task dialogs, and todo-specific renderer helpers.

This guide extends `src/renderer/components/AGENTS.md`.

## RESPONSIBILITIES

- Render todo board views and task editing flows
- Keep todo feature composition separate from unrelated agent or repository panels
- Reuse todo store state and feature-specific hooks where needed

## RULES

- Board, column, and card responsibilities should stay clear.
- Dialogs should edit store-backed task state through explicit actions.
- Renderer-only todo presentation logic belongs here; persistence and main-process behavior stay elsewhere.

## ANTI-PATTERNS

- Mixing todo persistence rules into UI components
- Letting todo UI depend directly on unrelated panel state
- Recreating generic drag, dialog, or card primitives instead of reusing existing ones
