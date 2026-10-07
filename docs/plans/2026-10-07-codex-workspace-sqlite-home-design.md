# Rejected: Reuse Codex SQLite State Per Worktree

## Problem

Infilux creates a private `CODEX_HOME` for each Codex UI session while linking all sessions for a worktree into that home. Two private homes recorded their first history backfill 185 and 104 seconds after directory creation. This was interpreted as evidence that indexing the worktree history caused the reported first-session `Waiting for startup` delay. Directory creation and backfill timestamps alone do not establish where those minutes were spent.

## Original Proposal

The proposal was to keep the private runtime home and existing worktree-scoped `sessions` symlink, create a persistent SQLite directory beside that worktree's `sessions` directory, and set `CODEX_SQLITE_HOME` for locally managed launches. Remote or caller-managed `CODEX_HOME` launches would remain unchanged.

Credentials, config, logs, and other session-local runtime files would stay in their existing locations. A user-configured `sqlite_home` takes precedence over the environment variable, per OpenAI Docs. This proposal does not account for absolute rollout paths in the shared index.

## Contrary Evidence

A fresh Codex 0.160.0 app-server indexed 116 threads from the real 6.6 GB session-history tree in approximately 2.3 seconds on two separate new runtime homes. Starting a thread took approximately 100 ms in an isolated home. A real CLI session with the inherited configuration and Infilux's CodeGraph MCP arguments reached its interactive prompt promptly and completed a short first message in under 15 seconds, both with and without the shared Codex daemon. The original multi-minute delay is not currently reproducible.

Sharing SQLite has a concrete downside: Codex records absolute lexical rollout paths through the creating UI session's `CODEX_HOME/sessions` symlink. Once that private home is removed, later homes sharing its SQLite index retain stale paths. The indexed-only thread list then omits those entries. Reading an individual transcript can fall back to scanning JSONL, but that does not preserve fast indexed recovery.

## Decision

Do not implement the `CODEX_SQLITE_HOME` override on the basis of this hypothesis. Keep separate UI runtime homes and existing per-worktree history behavior. For managed local native Codex launches, use the CLI-supported `--no-daemon` mode to remove dependence on shared background-server startup. This is a scoped mitigation, not a demonstrated explanation for the original multi-minute delay. Preserve remote, wrapped, and custom-executable launch behavior. If the delay recurs, capture the existing Infilux agent-startup timeline and Codex startup diagnostics before changing database placement.
