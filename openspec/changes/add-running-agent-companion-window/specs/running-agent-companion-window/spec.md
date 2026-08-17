## Purpose

Provide a compact secondary-window view of active agent work while retaining one authoritative source for session and task state in the main process and existing Infilux services.

## ADDED Requirements

### Requirement: Active-agent projection
The system SHALL expose a read-only projection of active agent sessions and associated task state to the companion window. Removed, completed, or inaccessible sessions SHALL be removed from the projection.

#### Scenario: Session lifecycle update
- **WHEN** an active session exits or is removed
- **THEN** the companion window removes or updates the matching projection entry without requiring a restart

### Requirement: Companion window lifecycle
The system SHALL create the companion window on demand, restore valid saved bounds, and release listeners and resources on destruction or application shutdown.

#### Scenario: Reopen companion window
- **WHEN** a user closes and reopens the companion window
- **THEN** the window restores valid saved bounds and requests a fresh projection snapshot

### Requirement: Safe main-window navigation
The companion window SHALL request focus navigation through typed IPC. The main window SHALL switch to the owning worktree and select the requested live session only when the target remains valid.

#### Scenario: Select active session
- **WHEN** a user activates a live companion entry
- **THEN** the main window focuses the corresponding worktree and agent session

#### Scenario: Select stale session
- **WHEN** a user activates an entry whose session was removed after the snapshot
- **THEN** navigation fails safely and does not change the main-window selection
