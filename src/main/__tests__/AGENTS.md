# MAIN PROCESS TESTS GUIDE

This directory contains tests for main-process behavior that does not belong to a narrower domain test folder.

This guide extends `src/main/AGENTS.md`.

## RESPONSIBILITIES

- Verify main-process lifecycle, registration, and shutdown-sensitive behavior at the appropriate boundary
- Keep high-risk bootstrap and cleanup expectations explicit

## RULES

- Prefer focused boundary tests with explicit fake dependencies over broad integration-by-accident coverage.
- Assert cleanup and lifecycle ordering when the tested behavior owns them.

## ANTI-PATTERNS

- Depending on ambient Electron runtime state without explicit setup
- Hiding lifecycle prerequisites in shared mutable fixtures
