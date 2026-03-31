# SETTINGS COMPONENTS GUIDE

This directory owns settings surfaces, settings-specific models, and settings-window composition.

This guide extends `src/renderer/components/AGENTS.md`.

## RESPONSIBILITIES

- Render settings categories, dialogs, preview panels, and settings-specific derived models
- Keep settings feature sections modular by domain such as provider, MCP, plugins, prompts, and appearance
- Coordinate with `stores/settings/` without reimplementing persistence logic

## RULES

- Presentation and editor interactions belong here; persistence, defaults, and migration belong in `stores/settings/`.
- Keep settings section models and labels close to the section that uses them.
- Prefer adding a new subsection folder when a settings area has multiple components or dialogs.
- Preserve token, theme, and accessibility policies when changing appearance settings.

## ANTI-PATTERNS

- Putting storage or migration logic in renderer components
- Building monolithic settings screens that mix unrelated domains
- Hardcoding theme semantics that should come from settings models or design tokens
