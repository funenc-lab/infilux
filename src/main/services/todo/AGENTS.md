# TODO SERVICES GUIDE

This directory owns main-process todo feature services and privileged operations for todo workflows.

This guide extends `src/main/services/AGENTS.md`.

## RESPONSIBILITIES

- Execute todo-domain operations that require main-process capabilities
- Keep todo feature rules isolated from renderer presentation

## RULES

- Return explicit todo-domain results that renderer stores can consume directly.
- Keep privileged side effects localized and easy to test.
- Avoid coupling todo logic to unrelated agent or panel concerns.

## ANTI-PATTERNS

- Putting board layout or kanban presentation rules into main services
- Spreading todo persistence behavior across unrelated domains
