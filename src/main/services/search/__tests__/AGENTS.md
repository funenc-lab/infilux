# SEARCH SERVICES TESTS GUIDE

This directory contains tests for privileged search execution and result shaping.

This guide extends `src/main/services/search/AGENTS.md`.

## RESPONSIBILITIES

- Verify search scope, limits, and normalized result shaping
- Keep backend execution details encapsulated behind stable service behavior

## RULES

- Use controlled search fixtures and explicit match expectations.
- Assert structured results instead of raw command output where possible.

## ANTI-PATTERNS

- Depending on broad repository state for simple search cases
- Pushing raw grep-like output into assertions when the service normalizes it
