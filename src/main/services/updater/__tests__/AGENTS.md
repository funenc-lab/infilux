# UPDATER SERVICES TESTS GUIDE

This directory contains tests for updater lifecycle and status reporting behavior.

This guide extends `src/main/services/updater/AGENTS.md`.

## RESPONSIBILITIES

- Verify update state transitions, readiness, and explicit updater signals
- Keep platform-specific updater behavior isolated and testable

## RULES

- Use fake updater adapters or fixtures instead of real update services.
- Assert observable updater states and transitions, including failure paths.

## ANTI-PATTERNS

- Treating updater side effects as fire-and-forget in tests
- Depending on live update infrastructure for routine coverage
