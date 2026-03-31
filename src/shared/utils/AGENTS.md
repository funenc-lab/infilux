# SHARED UTILS GUIDE

This directory contains process-agnostic helper functions used across main and renderer.

This guide extends `src/shared/AGENTS.md`.

## RESPONSIBILITIES

- Provide pure helpers for paths, workspace metadata, file URLs, diagnostics, and startup timing
- Normalize shared conventions such as remote virtual path handling
- Keep cross-process helper behavior deterministic and dependency-light

## RULES

- Utilities here must remain safe to import from both main and renderer.
- Prefer pure functions with explicit input validation.
- Keep shared naming stable because these helpers often become implicit conventions.
- Move process-specific helpers out immediately if they begin depending on Electron, DOM, or Node-only runtime behavior.

## ANTI-PATTERNS

- Burying remote-path rules in multiple places instead of using shared helpers
- Adding side effects or global caches without documenting the tradeoff
- Letting one helper become a hidden compatibility layer for unrelated behavior
