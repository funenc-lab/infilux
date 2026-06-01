# AGENT PROVIDER SETTINGS GUIDE

This directory owns renderer settings UI for agent provider profiles.

This guide extends `src/renderer/components/settings/AGENTS.md`.

## RESPONSIBILITIES

- Render provider profile lists, profile dialogs, and section-specific provider models
- Validate provider profile drafts before they are persisted through the settings boundary
- Keep provider-specific editable fields close to the settings UI that presents them

## RULES

- Keep persistence in the settings store or main-process bridge; this folder owns draft state and presentation only.
- Keep profile draft validation and model building in local model helpers.
- Preserve adapter capability checks before allowing save actions.
- Treat auth token inputs as sensitive and avoid logging or exposing their values in derived UI state.
- Keep provider IDs, generated profile IDs, and display order stable when editing existing profiles.
- Reuse shared settings section patterns before creating new dialog or list primitives.

## EXTENSION POINTS

- Add provider-specific draft fields in the local model only when the shared `AgentProviderProfile` contract supports them.
- Add list or dialog subcomponents when a provider flow grows beyond the current section surface.
- Add focused model tests for save eligibility, profile construction, and provider-specific optional fields.

## TESTING FOCUS

- Cover required-field validation, adapter support checks, create/edit behavior, and sensitive field preservation.
- Verify dialog actions through user-visible save, cancel, enable, disable, and delete flows.

## ANTI-PATTERNS

- Writing provider config files directly from renderer components
- Repeating validation rules across list, dialog, and settings shell components
- Storing transient dialog drafts in global settings state before the user saves
- Adding provider-specific UI state that cannot be represented by the shared provider profile contract
