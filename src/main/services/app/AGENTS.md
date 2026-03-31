# APP SERVICE GUIDE

This directory owns application-level environment detection, path validation, and recent-project management.

This guide extends `src/main/services/AGENTS.md`.

## RESPONSIBILITIES

- Validate project paths and workspace entry points
- Detect application/runtime capabilities from the local system
- Manage recent-project metadata and related persistence

## RULES

- Path validation must stay explicit and defensive.
- Keep filesystem or platform assumptions centralized here when they affect app boot flows.
- Return normalized results that higher layers can consume without reinterpreting raw platform details.

## ANTI-PATTERNS

- Letting renderer navigation concerns leak into app services
- Spreading path-normalization rules across unrelated modules
- Treating recent-project persistence as UI state
