## Purpose

Define observable load-control behavior for local and remote session runtimes so sustained output
and inactive session surfaces cannot consume unbounded resources or hide delivery failures from
diagnostics.

## ADDED Requirements

### Requirement: Visibility-aware session activity detection
The system SHALL schedule agent session activity detection per renderer window and SHALL not issue
activity requests while that window is hidden. Visible active sessions MUST be given priority over
visible inactive sessions, and a real session-output event MUST update activity state without
waiting for a poll.

#### Scenario: Hidden window suppresses activity requests
- **WHEN** a renderer window becomes hidden while it owns one or more agent sessions
- **THEN** the system issues no session-activity IPC request until that window becomes visible

#### Scenario: Real output updates an observed session
- **WHEN** an observed agent session emits output before its next activity check
- **THEN** the system updates that session as active without waiting for the scheduled check

#### Scenario: Active visible session has priority
- **WHEN** multiple visible agent sessions are due for activity detection
- **THEN** the active session is checked before inactive visible sessions

### Requirement: Bounded runtime protocol input
The system SHALL bound incomplete JSON-line protocol input for local supervisor and remote helper
transports. An input line exceeding the documented limit MUST not be retained in memory and MUST
close only the affected transport using established disconnect and recovery behavior.

#### Scenario: Protocol line exceeds the limit
- **WHEN** a supervisor or remote helper transport receives an unterminated protocol line larger
  than its documented maximum
- **THEN** the system clears the incomplete line, closes that transport, and leaves unrelated
  sessions and transports available

#### Scenario: Protocol message spans chunks within the limit
- **WHEN** a valid protocol message arrives in multiple chunks whose combined size is within the
  documented maximum
- **THEN** the system parses and delivers the message exactly once in its original order

### Requirement: Bounded and ordered session output delivery
The system SHALL bound pending producer-side output and per-window delivery work for every local
and remote session. When a delivery limit is exceeded, the system MUST use replay resynchronization
instead of retaining unbounded incremental output. Output delivered before a session exit MUST
remain ordered and complete at the configured replay boundary.

#### Scenario: Producer output exceeds its pending limit
- **WHEN** a session produces output that would exceed its pending delivery limit
- **THEN** the system discards only incremental pending delivery data, requests one replay
  resynchronization for that target, and retains no pending data beyond the configured limit

#### Scenario: Multiple visible sessions produce output
- **WHEN** two or more sessions in the same window produce sustained output
- **THEN** the system allocates bounded delivery work to each session and prioritizes the active
  session without reordering any individual session's output

#### Scenario: Session exits with queued output
- **WHEN** a session exits while it has queued output
- **THEN** the system delivers the queued output in order before emitting that session's exit event

### Requirement: Aggregate session performance diagnostics
The system SHALL expose aggregate session runtime diagnostics containing resource counts and sizes
only. Diagnostics MUST include pending output, resynchronization, transcript-pending, managed
session, and suspended-delivery counts, and MUST NOT include terminal content, commands, paths, or
credentials.

#### Scenario: Diagnostics snapshot is captured
- **WHEN** a main-process diagnostics snapshot is requested
- **THEN** the snapshot contains aggregate session load-control counters without terminal payloads

#### Scenario: Session output is sensitive
- **WHEN** terminal output contains arbitrary user or agent content
- **THEN** no terminal content is included in the session diagnostics snapshot

### Requirement: Bounded remote helper resource lifetime
The system SHALL enforce expiry and capacity limits for remote helper caches and SHALL release
watchers, searches, cache entries, and client write state when their owning connection no longer
has clients.

#### Scenario: A remote cache reaches capacity
- **WHEN** insertion would exceed a remote helper cache capacity
- **THEN** the system removes expired entries first and then deterministically evicts the least
  recently used remaining entry before retaining the new entry

#### Scenario: Final remote client disconnects
- **WHEN** the final client disconnects from a remote helper runtime
- **THEN** the system closes owned watchers, cancels owned searches, and clears connection-scoped
  caches and client write state
