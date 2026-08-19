# Session Output Performance Design

## Goal

Prevent high-volume agent and terminal output from exhausting main-process CPU, renderer CPU, memory, or disk bandwidth while preserving the latest session transcript and live terminal correctness.

## Problem Statement

The current transcript archive rewrites the full retention window whenever an append crosses the retention cap. A 32 MiB archive therefore reads and rewrites roughly 64 MiB for a small output chunk after the cap is reached. The main process also forwards all session output to mounted terminal views without a bounded per-view backlog.

## Approved Architecture

### Versioned transcript storage

New session archives use a V2 directory under the existing transcript root. Each archive contains fixed-size UTF-8-safe segment files and a small manifest. The writer appends only to the active segment. When retained bytes exceed the configured cap, it removes whole oldest segments and trims only the oldest retained segment. It never rewrites the complete retained transcript for normal output.

The archive reader walks segments from newest to oldest and returns at most the requested page size. Existing single-file UUID archives remain readable. Legacy `pty-*.log` files remain untouched and are not automatically migrated or deleted.

### Bounded output delivery

The main-process output batcher keeps bounded pending output per `(windowId, sessionId)`. A visible terminal receives batches at a controlled cadence. When the backlog crosses a high-water mark, the batcher replaces queued live output with a resync marker rather than retaining unbounded data. The renderer then reloads the recent transcript page before it resumes live output.

Inactive terminal views do not consume live output. Their session transcript remains durable and they refresh from the archive when activated.

### Observability

The archive exposes lightweight diagnostic counters for retained bytes, queued write bytes, flushes, segment rotations, and legacy fallbacks. The output batcher reports pending bytes, resync counts, and dropped live batches. These values are included in existing session diagnostics rather than creating a parallel global state store.

## Data Flow

```text
PTY/tmux data
  -> SessionManager archive append
  -> V2 segmented transcript writer
  -> SessionOutputBatcher bounded queue
  -> renderer session-data event
  -> useXterm animation-frame drain

Backlog overflow
  -> session resync signal
  -> renderer reads transcript page
  -> renderer resumes live output
```

## Compatibility and Recovery

- V1 single-file archives continue to serve `readPage()` without migration.
- V2 manifests are atomically replaced. If a manifest is missing or corrupt, segment filenames are scanned and a replacement manifest is rebuilt.
- `flush()` drains buffered writes before reads, explicit termination, and deletion.
- `delete()` removes either the V1 file or the V2 archive directory only after pending writes settle.
- The 32 MiB default retention limit and 256 KiB maximum read page remain unchanged.

## Non-Goals

- No automatic deletion of legacy transcript files.
- No changes to PTY creation, tmux ownership, remote transport, or agent persistence semantics.
- No output loss for active sessions; overload is handled through archive-backed resync rather than silent dropping.

## Acceptance Criteria

- Repeated output after a full archive performs append/segment rotation work proportional to new bytes, not to the full 32 MiB retention window.
- A transcript page preserves UTF-8 boundaries and returns the correct newest bytes after rotation and recovery.
- A bounded queue protects the main and renderer processes under five simultaneous high-output sessions.
- Hidden terminal views stop live xterm writes and correctly restore the latest output on activation.
- Legacy transcript data remains discoverable and is never deleted by the upgrade.
