# AGENT PANEL SUBCOMPONENTS GUIDE

This directory contains focused subcomponents that support the main agent panel.

This guide extends `src/renderer/components/chat/AGENTS.md`.

## RESPONSIBILITIES

- Host agent-panel-only presentation pieces that should not clutter the main panel file
- Keep empty, error, or utility subviews scoped to the agent panel domain

## RULES

- Components here should remain small, panel-specific, and presentational.
- Shared agent-panel models should stay in the parent `chat/` folder unless they are only used here.
- Avoid introducing alternate state ownership inside subcomponents.

## ANTI-PATTERNS

- Moving core session orchestration into subcomponents
- Keeping reusable chat-wide components trapped in this leaf folder
