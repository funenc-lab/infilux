---
target: AI integration settings layout
total_score: 24
p0_count: 0
p1_count: 2
timestamp: 2026-09-20T06-39-45Z
slug: nderer-components-settings-integrationsettings-tsx
---
# AI Integration Settings Layout Critique

## Design Health Score

| Heuristic | Score | Key issue |
| --- | ---: | --- |
| Visibility of system status | 3/4 | Provider detection and bridge port are visible; async loading and delete feedback are less explicit. |
| Match between system and real world | 3/4 | Order is understandable for developers, but Provider Watcher and Provider Disable Feature are technical labels. |
| User control and freedom | 3/4 | Switches and dialogs are available, but provider deletion has no obvious recovery path. |
| Consistency and standards | 2/4 | Provider, bridge, MCP, plugin, and prompt sections use different visual grouping patterns. |
| Error prevention | 2/4 | The page exposes many independent toggles and status-field choices at once. |
| Recognition rather than recall | 2/4 | The long mixed-domain page makes users remember where a setting lives. |
| Flexibility and efficiency | 3/4 | Provider switching and progressive bridge controls are useful for power users. |
| Aesthetic and minimalist design | 2/4 | Removing capability coverage helped, but repeated separators and nested blocks still create a long scroll. |
| Error recovery | 2/4 | Dependency dialog is good; destructive provider actions lack visible undo/confirmation. |
| Help and documentation | 2/4 | Descriptions exist, but several are long and provider-specific terminology is not defined. |
| **Total** | **24/40** | **Usable, but needs a focused layout pass.** |

## Overall impression

The page is more focused after removing the capability matrix, but it is not fully balanced yet. It still reads as four settings domains appended into one continuous form: provider management, IDE bridge runtime, MCP, plugins, and prompts.

## Cognitive load

Four of eight checklist items fail: single focus, chunking, visual hierarchy, and one-decision-at-a-time. The status-line field group exposes about ten choices at once, which exceeds the practical four-choice limit. Progressive disclosure for the bridge and status fields is a good foundation.

## What's working

- The provider list has a clear active state, reorder affordance, and compact actions.
- Bridge settings are hidden until the bridge is enabled.
- `settings-field-row` gives the bridge controls a stable label/control alignment on wider panels.

## Priority issues

1. **[P1] Mixed domains in one scroll** — Providers, IDE Bridge, MCP, plugins, and prompts have equal visual weight. Split them into titled `control-panel` sections, or move MCP/plugins/prompts to a dedicated Skills & Tools category.
2. **[P1] Status fields are too exposed** — Ten checkboxes appear after enabling Status Line. Put them behind a “Customize displayed fields” disclosure.
3. **[P2] Weak section rhythm** — The page alternates between flat rows, `border-t` separators, and nested rounded panels. Use one section-header pattern and one spacing rhythm.
4. **[P2] Provider block is overloaded** — Detected config, provider type, saved profiles, watcher, and disable behavior should be visually separated into “Current config” and “Saved profiles”.

## Detector and browser evidence

- Deterministic detector: no findings for the target settings files.
- Browser inspection: skipped because no browser automation tool was exposed in this session.
