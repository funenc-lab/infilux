# FILE COMPONENTS TESTS GUIDE

This directory contains tests for file browsing, editor, preview, and file-workflow UI behavior.

This guide extends `src/renderer/components/files/AGENTS.md`.

## RESPONSIBILITIES

- Verify editor restoration, dirty-file prompts, external-change handling, and preview behavior
- Cover local-path and remote-path workflows explicitly where the UI supports both
- Keep Monaco-related policy behavior testable without over-coupling to implementation details

## RULES

- Assert file-open, tab, preview, and dialog behavior through user-visible outcomes.
- Use focused fixtures for editor state, navigation requests, and remote path scenarios.
- Cover reload and selection-cache behavior when a feature change can affect restoration or external updates.

## ANTI-PATTERNS

- Assuming local-only file paths in tests for shared file flows
- Snapshotting large editor trees instead of checking targeted behavior
- Coupling tests to Monaco internals that are not part of the UI contract
