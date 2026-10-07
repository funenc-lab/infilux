# Codex worktree resume history consistency

## Goal

Keep Infilux Codex resume history limited to the selected worktree while making completed, matching sessions created by an external Codex CLI available in that worktree. Two Infilux Codex processes in the same worktree should see the same resumable session inventory. Do not write to the user's external Codex history or merge histories from sibling worktrees.

## Current behavior

Each Infilux UI session receives an isolated `CODEX_HOME` whose `sessions` entry links to a worktree-scoped directory. A one-time migration copies matching external JSONL files into that directory. After its v2 marker is written, subsequently created external sessions are never imported. SQLite-backed Codex state remains inside each UI session's runtime home, so the same worktree can have divergent session indexes. The existing fake-Codex end-to-end scenario checks JSONL visibility but not a real Codex resume picker.

## Design

Keep per-UI-session runtime homes for configuration and transient state, and keep the current worktree-scoped `sessions` directory. Give all Codex launches for a worktree one stable, Infilux-owned SQLite state directory alongside its session history. Use Codex's documented SQLite location override; because `sqlite_home` configuration takes precedence over `CODEX_SQLITE_HOME`, the launch must enforce the worktree-scoped value even when the inherited configuration contains `sqlite_home`. Never copy or edit a live SQLite database. Old per-UI runtime homes retain their existing cleanup rules; the stable worktree index is retained independently of any UI session.

Continue the existing one-time migration for legacy Infilux histories, but add an independent incremental import of external Codex sessions before the Codex process starts. Inspect each candidate's `session_meta.cwd` and import only matching files into the current worktree. Deduplicate by relative session path and thread ID. Perform an atomic copy with source-stability checks so partially written files are not published. Never replace or append to an existing worktree transcript: a Codex process may have that file open, and even a last-moment content check cannot prevent a concurrent write from being lost when the path is replaced. An external append to an already imported session therefore remains external; importing new conversations is independent of that session. Retain retryability for transient read errors and invalid or still-changing source files. Serialize importers with an Infilux-owned, worktree-local SQLite transaction, without editing Codex's private SQLite state. Wait for competing importers only for a bounded period; if synchronization cannot finish, report a narrow warning, allow launch, and retry on the next launch.

## Verification

Write a regression that adds an external session after the legacy migration marker, then checks it is available on the next launch and sibling-worktree sessions are excluded. Test idempotent imports, concurrent launch, failure/retry, and that both an external append and a locally open writer leave an already imported target untouched. Test that launches in the same worktree select the same SQLite state directory while different worktrees do not, and that ending one UI session cannot delete that directory. Supplement the existing fake-Codex E2E scenario with an isolated real-Codex CLI check that imported transcripts actually appear in resume results. If the installed CLI does not index imported JSONL through its supported startup path, stop and reassess the indexing integration instead of writing private Codex SQLite tables.

## Deliberate exclusions

Do not merge worktrees, modify the external `~/.codex` directory, share the entire `CODEX_HOME`, refresh already imported sessions, import currently active sessions without stability checks, or directly manipulate Codex SQLite files. Safe refresh requires cooperation from active Codex writers and is outside this approved change.
