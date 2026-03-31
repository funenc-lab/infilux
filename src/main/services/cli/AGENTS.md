# CLI SERVICES GUIDE

This directory owns local CLI detection and installation support for agent-related tooling.

This guide extends `src/main/services/AGENTS.md`.

## RESPONSIBILITIES

- Detect whether supported CLIs are available
- Resolve installation or setup requirements
- Keep tmux-related detection isolated from generic CLI detection

## RULES

- Platform-specific lookup logic should stay explicit and testable.
- Return normalized detection results instead of leaking raw shell output.
- Do not mix renderer-facing copy or dialog policy into CLI services.

## ANTI-PATTERNS

- Assuming one executable lookup strategy works across all platforms
- Hiding installation side effects inside methods that appear read-only
