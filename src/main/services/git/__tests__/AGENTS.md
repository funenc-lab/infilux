# GIT SERVICES TESTS GUIDE

This directory contains tests for Git services, worktree behavior, runtime helpers, and safe-directory logic.

This guide extends `src/main/services/git/AGENTS.md`.

## RESPONSIBILITIES

- Verify repository resolution, worktree behavior, and normalized Git results
- Cover encoding, runtime, and safe-directory policies with controlled fixtures
- Keep repository-scoped behavior isolated from renderer source-control presentation

## RULES

- Use temporary repositories and worktrees instead of shared developer repos.
- Keep test Git configuration scoped to the fixture environment.
- Assert normalized domain results, not raw CLI strings, unless the parser itself is under test.
- Cover cleanup or rollback behavior when tests create worktrees or mutate repository state.

## ANTI-PATTERNS

- Depending on global Git config or the current checkout state
- Reusing mutable fixture repositories across unrelated cases
- Asserting UI-oriented labels in service tests
