# REPOSITORY COMPONENTS TESTS GUIDE

This directory contains tests for repository-management dialogs and repository settings UI.

This guide extends `src/renderer/components/repository/AGENTS.md`.

## RESPONSIBILITIES

- Verify repository administration flows, validation, and dialog behavior
- Keep repository-management coverage distinct from Git widgets and shell layout

## RULES

- Assert repository identity, path clarity, and explicit mutation behavior.
- Use focused fixtures for repository models and settings actions.

## ANTI-PATTERNS

- Mixing repository administration tests with source-control panel behavior
- Hiding path validation assumptions in generic setup helpers
