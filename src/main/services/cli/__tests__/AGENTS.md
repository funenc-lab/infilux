# CLI SERVICES TESTS GUIDE

This directory contains tests for CLI detection, installation helpers, and tmux-related discovery logic.

This guide extends `src/main/services/cli/AGENTS.md`.

## RESPONSIBILITIES

- Verify platform-aware executable discovery and normalized detection results
- Cover installation/setup flows without mutating the developer machine
- Keep tmux-specific behavior isolated from generic CLI coverage

## RULES

- Mock shell/process output explicitly and assert normalized results.
- Use temporary filesystems or fixtures for installation paths and generated artifacts.
- Cover read-only detection and mutating setup paths as distinct behaviors.

## ANTI-PATTERNS

- Running real installation commands against the local environment
- Assuming one platform's lookup behavior is universal
- Hiding mutation inside tests labeled as detection-only
