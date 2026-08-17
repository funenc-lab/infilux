## Purpose

Allow validated application URLs to restore the correct worktree and focus a specific eligible agent session without weakening existing path-based deep links or session isolation.

## ADDED Requirements

### Requirement: Session-focus URL parsing
The system SHALL accept an Infilux URL containing a session focus target and optional repository or worktree context. It SHALL preserve existing path-only URL behavior.

#### Scenario: Valid session link
- **WHEN** the application receives a valid Infilux session-focus URL
- **THEN** it creates a pending focus request for the identified session and context

#### Scenario: Existing path link
- **WHEN** the application receives an existing path-only Infilux URL
- **THEN** it opens the path using current behavior without creating a session focus request

### Requirement: Launch-mode consistency
The system SHALL process valid session-focus URLs during cold start, macOS open-url handling, and second-instance forwarding on Windows and Linux.

#### Scenario: Second instance link
- **WHEN** a second application instance is invoked with a valid session-focus URL
- **THEN** the existing main window is focused and receives exactly one focus request

### Requirement: Safe session focus
The renderer SHALL switch to the owning worktree and select the requested session only when it belongs to the resolved repository context. Unknown, stale, malformed, or mismatched targets SHALL leave the current selection unchanged.

#### Scenario: Stale session
- **WHEN** a session-focus URL refers to a removed session
- **THEN** the application reports a recoverable failure and retains the current UI selection
