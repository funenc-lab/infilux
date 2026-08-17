## Purpose

Provide a safe, bounded way to inspect and reuse prior local Codex conversations without
weakening Infilux session ownership, worktree isolation, or remote-session behavior.

## ADDED Requirements

### Requirement: Local Codex session discovery
The system SHALL list recent Codex sessions for a requested local worktree by matching normalized
session metadata to the requested working directory. A query MAY target a native or WSL Codex
session root and SHALL return a serializable result containing session identity, working directory,
timestamps, and an optional derived title.

#### Scenario: Matching local worktree sessions
- **WHEN** a user opens history for a local Codex session with a matching working directory
- **THEN** the system returns only sessions whose normalized metadata working directory matches the
  requested worktree, ordered from most recently updated to least recently updated

#### Scenario: Remote worktree history request
- **WHEN** a user opens history for a remote worktree
- **THEN** the system reports that local Codex history is unavailable and does not scan or expose a
  local Codex session as a remote recovery candidate

### Requirement: Bounded and fault-tolerant history reads
The system SHALL bound session discovery and transcript reads by configured result or message limits.
Malformed, missing, unreadable, or concurrently deleted session files SHALL be skipped or returned
as an explicit serializable error without failing unrelated sessions or blocking application startup.

#### Scenario: Malformed historical session file
- **WHEN** a candidate Codex session file contains malformed metadata or transcript entries
- **THEN** valid sessions and valid messages remain available, and the malformed entry does not
  terminate the query or crash the renderer

#### Scenario: History service initialization failure
- **WHEN** the history cache or watcher cannot initialize during application startup
- **THEN** application startup continues and a later history request returns an explicit unavailable
  or error result instead of hanging indefinitely

### Requirement: Historical conversation inspection
The system SHALL allow a user to inspect a bounded sequence of user and Codex text messages for a
selected local or WSL session. The response SHALL identify whether more messages are available and
shall not render untrusted transcript payloads as executable content.

#### Scenario: Limited transcript preview
- **WHEN** a user opens a session whose transcript exceeds the requested message limit
- **THEN** the system returns the bounded message sequence and marks the result as truncated

### Requirement: Safe historical session binding
The system SHALL bind a historical Codex provider session only when its normalized working directory
matches the active local Infilux worktree and the provider session is not claimed by another active
Infilux UI session. A rejected binding SHALL preserve the current binding and return a reason that
can be presented to the user.

#### Scenario: Bind matching session
- **WHEN** a user selects an unclaimed historical Codex session from the active local worktree
- **THEN** the active Infilux session records that provider session identity and uses it for future
  recovery

#### Scenario: Reject cross-worktree session
- **WHEN** a user selects a historical Codex session belonging to a different working directory
- **THEN** the system rejects the request without changing the active Infilux session binding

#### Scenario: Reject already-claimed provider session
- **WHEN** a user selects a historical Codex session already bound to another active UI session
- **THEN** the system rejects the request without changing either session binding
