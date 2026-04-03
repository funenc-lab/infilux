# TODO SERVICES TESTS GUIDE

This directory contains tests for privileged todo-domain services.

This guide extends `src/main/services/todo/AGENTS.md`.

## RESPONSIBILITIES

- Verify todo-domain service behavior and privileged side effects
- Keep todo persistence and normalization behavior isolated from renderer kanban presentation

## RULES

- Assert explicit todo-domain results and mutations.
- Use focused fixtures for task data and privileged operations.

## ANTI-PATTERNS

- Testing kanban layout behavior from a main-process service suite
- Spreading todo persistence assertions across unrelated domains
