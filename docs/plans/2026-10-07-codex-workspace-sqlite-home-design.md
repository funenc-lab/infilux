# Reuse Codex SQLite State Per Worktree

## Problem

Infilux creates a private `CODEX_HOME` for each Codex UI session while linking all sessions for a worktree into that home. Codex creates a fresh SQLite index for each private home and repeatedly backfills the same large session history during startup. Two observed homes completed backfill 185 and 104 seconds after creation, respectively.

## Design

Keep the private runtime home and existing worktree-scoped `sessions` symlink. Create a persistent SQLite directory beside that worktree's `sessions` directory and return its path from `CodexRuntimeHomeService.prepareRuntimeHome`. Set `CODEX_SQLITE_HOME` only for locally managed Codex launches, alongside `CODEX_HOME`, using the documented Codex environment variable. Include it in the explicit tmux session environment so persistent local hosts receive the same value. Remote or caller-managed `CODEX_HOME` launches remain unchanged.

This leaves credentials, config, logs, and other session-local runtime files in their existing locations. The SQLite directory is not inside a disposable UI runtime home, so explicitly ending a session or pruning its home cannot delete the shared state. Codex owns SQLite concurrency and schema migrations; Infilux does not modify database files. A user-configured `sqlite_home` takes precedence over the environment variable, per OpenAI Docs.

## Failure And Migration

Directory creation must succeed before launching Codex; propagate an error on failure rather than silently returning to a fresh private index. No existing history or database is moved or deleted. An existing worktree incurs one initial backfill into the new shared directory; subsequent new UI sessions should reuse it. A genuinely new worktree starts with an empty history.

## Verification

Add focused tests for shared path identity across UI sessions, isolation across worktrees, directory persistence after home release, environment propagation through IPC and tmux, and unchanged remote/non-Codex paths. Run targeted tests, typecheck, lint, full unit tests, and a local cold/warm startup measurement where safe.
