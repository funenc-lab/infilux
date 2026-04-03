# SETTINGS COMPONENTS GUIDE

This directory owns settings surfaces, settings-specific models, and settings-window composition.

This guide extends `src/renderer/components/AGENTS.md`.

## RESPONSIBILITIES

- Render settings categories, dialogs, preview panels, and settings-specific derived models
- Keep settings feature sections modular by domain such as provider, MCP, plugins, prompts, and appearance
- Coordinate with `stores/settings/` without reimplementing persistence logic

## HOTSPOTS

- `SettingsShell.tsx`
- `SettingsContent.tsx`
- `AppearanceSettings.tsx`
- `AppearanceThemeEditorView.tsx`
- settings-specific model helpers in this directory

## RULES

- Presentation and editor interactions belong here; persistence, defaults, and migration belong in `stores/settings/`.
- Keep settings section models and labels close to the section that uses them.
- Prefer adding a new subsection folder when a settings area has multiple components or dialogs.
- Preserve token, theme, and accessibility policies when changing appearance settings.
- Keep draft editing, preview state, and persisted-save behavior explicit when a section has multi-step editing.
- Make destructive, reset, import, or migration-adjacent actions unmistakable in the UI.
- Reuse section-scoped models/helpers before adding cross-settings utility layers.

## EXTENSION POINTS

- Add a subsection folder when a settings area needs multiple dialogs, models, or preview surfaces.
- Keep appearance/theme derivation in local model helpers when it only serves settings UI.
- Add focused section-level test helpers for save/discard, preview, and reset flows when the interaction is reused.

## TESTING FOCUS

- Verify save, discard, reset, and preview behavior through user-visible interactions.
- Cover settings sections that coordinate local draft state separately from persisted store state.
- Assert theme/token semantics through stable models or rendered behavior, not brittle DOM snapshots.

## ANTI-PATTERNS

- Putting storage or migration logic in renderer components
- Building monolithic settings screens that mix unrelated domains
- Hardcoding theme semantics that should come from settings models or design tokens
- Repeating section labels, option descriptions, or validation rules across multiple settings surfaces
