## Purpose

Define bounded canvas-terminal resource behavior so hidden idle terminal views release renderer
resources while preserving the session context required for a correct and usable restore.

## ADDED Requirements

### Requirement: Bounded mounted canvas terminals
The system SHALL provide bounded default limits for concurrently mounted canvas terminal instances
per worktree and per workspace. Existing user-configured limits MUST remain valid unless they are
outside the supported range.

#### Scenario: New installation uses bounded defaults
- **WHEN** a user has not configured canvas terminal mount limits
- **THEN** the system uses the documented bounded defaults for worktree and workspace terminal
  instances

#### Scenario: Existing valid configuration is loaded
- **WHEN** a user has a persisted canvas terminal mount limit within the supported range
- **THEN** the system preserves that configured value

### Requirement: Hidden idle terminal hibernation
The system SHALL hibernate an eligible canvas terminal only after it remains hidden and inactive for
the documented idle period. The system MUST NOT hibernate an active terminal, a visible terminal, a
terminal with active text selection, or a read-only transcript terminal.

#### Scenario: Hidden inactive terminal reaches the idle threshold
- **WHEN** an eligible terminal remains hidden and inactive for the idle threshold
- **THEN** the system releases that terminal's renderer, resize, and live output-delivery resources
  while retaining its bounded recovery context

#### Scenario: Visible terminal remains live
- **WHEN** a terminal is visible or active
- **THEN** the system does not hibernate that terminal

### Requirement: Ordered terminal restoration
The system SHALL restore a hibernated terminal through the session replay/resynchronization flow
before applying subsequent live output. The system MUST preserve the bounded replay context and
must not duplicate, reorder, or visibly corrupt output across restoration.

#### Scenario: Hibernated terminal becomes visible
- **WHEN** a user makes a hibernated terminal visible
- **THEN** the system recreates its terminal surface, requests current output delivery, applies the
  replay or resynchronization payload, and only then accepts subsequent live output

#### Scenario: Session produces output while terminal is hibernated
- **WHEN** a session emits output while its terminal is hibernated
- **THEN** the system does not write to the disposed terminal and restores the latest bounded
  replay context when the terminal is made visible

### Requirement: Restored terminal interaction state
The system SHALL preserve supported terminal interaction context across hibernation, including the
stored replay context and recoverable viewport/search state. If a state item cannot be restored, the
system MUST restore terminal output correctness before attempting optional interaction state.

#### Scenario: Restore follows a search interaction
- **WHEN** a terminal with a recoverable search state is hibernated and restored
- **THEN** the system restores correct output first and then restores the search state when valid
