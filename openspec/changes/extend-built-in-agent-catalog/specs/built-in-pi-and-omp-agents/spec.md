## Purpose

Make supported Pi and OMP command-line agents discoverable and capability-aware without weakening the existing custom-agent escape hatch or assuming unavailable local tools can be launched.

## ADDED Requirements

### Requirement: Built-in agent discovery
The system SHALL detect installed Pi and OMP CLI executables using the same platform-aware detection flow as existing built-in agents and SHALL expose an unavailable state when an executable or supported version is absent.

#### Scenario: Installed supported CLI
- **WHEN** a supported Pi or OMP executable is available
- **THEN** the agent appears as an available built-in option with its declared command and capability profile

#### Scenario: Missing CLI
- **WHEN** Pi or OMP is not installed
- **THEN** the agent is reported as unavailable and the application does not attempt a launch

### Requirement: Catalog-driven launch behavior
The system SHALL launch available Pi and OMP agents through the shared built-in catalog contract, including declared completion signaling and runtime capability constraints.

#### Scenario: Launch available built-in agent
- **WHEN** a user starts an available Pi or OMP agent in a compatible worktree
- **THEN** the created session uses the catalog command and declared capability policy

### Requirement: Backward-compatible custom agents
The system SHALL preserve existing custom-agent configuration, launch behavior, and capability fallback when Pi or OMP built-in entries are added.

#### Scenario: Existing custom agent
- **WHEN** a user has a saved custom agent configuration
- **THEN** it remains selectable and its behavior is unchanged after catalog expansion
