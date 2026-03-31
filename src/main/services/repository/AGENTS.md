# REPOSITORY SERVICES GUIDE

This directory owns repository-scoped context resolution and repository-level coordination helpers.

This guide extends `src/main/services/AGENTS.md`.

## RESPONSIBILITIES

- Resolve repository context from paths, worktrees, or runtime inputs
- Keep repository identity and normalization rules centralized

## RULES

- Repository context should be deterministic and explicit.
- Prefer returning normalized repository descriptors over ad hoc path fragments.
- Keep repository identity logic separate from renderer selection state.

## ANTI-PATTERNS

- Duplicating repository resolution logic across Git, file, or renderer modules
- Hiding repository assumptions in helpers with generic names
