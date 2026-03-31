# RENDERER UTILS GUIDE

This directory contains small renderer-specific utilities that do not belong in hooks, components, or shared cross-process helpers.

This guide extends `src/renderer/AGENTS.md`.

## RESPONSIBILITIES

- Provide lightweight renderer-only helpers with clear ownership
- Keep utilities here narrower than `lib/` and free of feature sprawl

## RULES

- Prefer pure helpers with explicit inputs.
- If a utility becomes reusable across many renderer domains, consider moving it to `lib/`.
- If it becomes process-agnostic, move it to `src/shared/`.

## ANTI-PATTERNS

- Using `utils/` as a fallback for unclear ownership
- Hiding store or Electron dependencies behind generic helper names
