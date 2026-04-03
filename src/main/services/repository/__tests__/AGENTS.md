# REPOSITORY SERVICES TESTS GUIDE

This directory contains tests for repository-context resolution helpers.

This guide extends `src/main/services/repository/AGENTS.md`.

## RESPONSIBILITIES

- Verify deterministic repository identity and path normalization behavior
- Keep repository-context coverage isolated from renderer selection concerns

## RULES

- Use explicit path and worktree fixtures.
- Assert normalized repository descriptors rather than ad hoc fragments.

## ANTI-PATTERNS

- Hiding repository assumptions in opaque fixture setup
- Testing renderer state from a repository service suite
