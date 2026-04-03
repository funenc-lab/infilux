# TERMINAL SERVICES TESTS GUIDE

This directory contains tests for PTY lifecycle management and shell detection behavior.

This guide extends `src/main/services/terminal/AGENTS.md`.

## RESPONSIBILITIES

- Verify terminal creation, resize, streaming, and teardown behavior
- Cover shell detection precedence and fallback handling
- Keep PTY transport behavior isolated from session persistence concerns

## RULES

- Use fake PTY/process adapters or controlled fixtures instead of long-lived real terminals.
- Assert terminal cleanup on shutdown, detach, or error paths.
- Cover shell-selection fallback rules explicitly when behavior differs by platform.

## ANTI-PATTERNS

- Leaving PTYs alive after a test ends
- Mixing session restoration assertions into terminal transport suites
- Relying on the developer machine's default shell as a hidden fixture
