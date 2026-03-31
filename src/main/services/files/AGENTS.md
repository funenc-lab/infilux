# FILE SERVICES GUIDE

This directory owns privileged file access helpers and file watcher lifecycle management.

This guide extends `src/main/services/AGENTS.md`.

## RESPONSIBILITIES

- Read and write local file content safely
- Manage file watcher setup, event fan-out, and cleanup
- Support higher layers that work with both local and remote-aware file flows

## RULES

- Treat watcher ownership as lifecycle-sensitive state.
- Keep path validation and normalization explicit.
- Release all watchers when windows or subscriptions go away.
- Do not assume every file-related flow is local-only when the caller supports remote virtual paths.

## ANTI-PATTERNS

- Creating watchers without deterministic teardown
- Baking renderer-specific throttling or UI policy into file services
- Assuming one watcher model is safe for every file operation
