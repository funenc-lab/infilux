# RENDERER COMPONENTS TESTS GUIDE

This directory contains tests for renderer components that do not belong to a narrower feature test folder.

This guide extends `src/renderer/components/AGENTS.md`.

## RESPONSIBILITIES

- Verify shared component behavior and feature composition at the correct boundary
- Keep presentation-focused coverage distinct from hook, store, and service tests

## RULES

- Assert user-visible behavior and explicit component contracts.
- Use feature-local helpers only when the tested component actually owns the behavior.

## ANTI-PATTERNS

- Repeating the same behavior across parent and child component suites
- Moving store or service coverage into generic component tests
