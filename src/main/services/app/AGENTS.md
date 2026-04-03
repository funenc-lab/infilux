# APP SERVICE GUIDE

This directory owns application-level environment detection, path validation, and recent-project management.

This guide extends `src/main/services/AGENTS.md`.

## RESPONSIBILITIES

- Validate project paths and workspace entry points
- Detect application/runtime capabilities from the local system
- Manage recent-project metadata and related persistence

## ASSUMPTIONS

- Normal work in this directory targets development-time behavior, local workspaces, and test fixtures.
- Installed or packaged app bundles are release artifacts, not the default target for day-to-day development.

## RULES

- Path validation must stay explicit and defensive.
- Keep filesystem or platform assumptions centralized here when they affect app boot flows.
- Return normalized results that higher layers can consume without reinterpreting raw platform details.

## DEVELOPMENT ISOLATION

- Treat app-service development and debugging as development-environment-only unless the task explicitly targets installer, updater, or packaged-runtime behavior.
- Use local source checkouts, development builds, temporary directories, and test fixtures for validation.
- Do not launch, patch, inspect, mutate, or depend on a real installed `Infilux.app` bundle or any user-installed production app instance during normal development work.
- Do not read from or write to `/Applications`, `~/Applications`, packaged app bundles, or user production config/state locations as part of routine feature development.
- If packaged-app behavior must be handled in code, isolate it behind explicit helpers with intent-revealing names and cover it with tests or fixtures instead of manual operations on an installed app.
- Prefer mocked metadata, fixtures, and synthetic paths when validating bundle discovery, bundle identifiers, icons, or app-launch flows that would otherwise touch installed applications.
- When a change can affect both development and packaged runtimes, keep the boundary explicit and verify the development path first; never use the installed app as the default verification target.

## EXTENSION POINTS

- Add dedicated helpers for runtime-mode detection, path-policy enforcement, and packaged-app guards instead of scattering bundle checks across services.
- Keep release-only or installer-specific behavior in narrow, clearly named entry points so the default development path remains isolated and safe.

## ANTI-PATTERNS

- Letting renderer navigation concerns leak into app services
- Spreading path-normalization rules across unrelated modules
- Treating recent-project persistence as UI state
- Treating a locally installed app bundle as a safe development sandbox
- Adding convenience logic that silently falls back to packaged or production paths
