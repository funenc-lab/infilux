## Purpose

Provide reliable Windows terminal creation, backend fallback, output delivery, and cleanup while
preserving existing Infilux terminal behavior on non-Windows platforms.

## ADDED Requirements

### Requirement: Explicit Windows PTY backend selection
The system SHALL select a Windows PTY backend from detected operating-system capability and report the
selected backend as serializable runtime metadata. Unsupported or unknown capability SHALL select the
safe fallback backend.

#### Scenario: Modern Windows capability
- **WHEN** a supported Windows build creates a terminal
- **THEN** the terminal uses the ConPTY backend and reports that selection

#### Scenario: Unsupported Windows capability
- **WHEN** a Windows build cannot support ConPTY
- **THEN** the terminal uses the WinPTY fallback without changing the renderer terminal API

### Requirement: Isolated helper lifecycle
The system SHALL create Windows PTY sessions through an isolated helper lifecycle with bounded create
and destroy operations. Failed creation SHALL not leave a helper or PTY process running.

#### Scenario: Helper creation timeout
- **WHEN** a helper does not report a created terminal before the configured timeout
- **THEN** the system returns a terminal creation failure and terminates the helper process tree

#### Scenario: Data before activation
- **WHEN** a helper emits terminal output before its session is activated
- **THEN** the output is delivered once after activation in original order

### Requirement: Deterministic teardown
The system SHALL terminate the Windows helper and owned PTY on terminal destroy, session detach, and
application shutdown. Repeated teardown requests SHALL be safe and shall not emit duplicate exits.

#### Scenario: Repeated destroy
- **WHEN** the same Windows terminal is destroyed more than once
- **THEN** cleanup completes without throwing and the renderer receives at most one exit event

### Requirement: Non-Windows compatibility
The system SHALL preserve existing terminal creation, data, resize, and teardown behavior on macOS,
Linux, and remote terminal hosts.

#### Scenario: macOS terminal creation
- **WHEN** a terminal is created on macOS
- **THEN** it uses the existing terminal transport and does not start a Windows helper
