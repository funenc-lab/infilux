## Purpose

Show branch and merge topology in Source Control so users can understand commit relationships while retaining existing commit history, diff, and worktree workflows.

## ADDED Requirements

### Requirement: Structured commit topology
The system SHALL provide each displayed commit with stable graph lane, parent, and reference metadata sufficient to render linear history, branches, and merges deterministically.

#### Scenario: Merge commit
- **WHEN** the selected history contains a commit with multiple parents
- **THEN** graph data identifies every parent transition required to render the merge

### Requirement: Comparison markers
The system SHALL represent incoming and outgoing comparison markers separately from persisted commits and visually distinguish them from HEAD and ordinary commit nodes.

#### Scenario: Ahead branch
- **WHEN** the active branch has outgoing commits relative to its tracking branch
- **THEN** history displays an outgoing comparison marker that is not selectable as a persisted commit

### Requirement: Accessible graph presentation
The system SHALL render graph topology beside the existing commit list without removing keyboard navigation, selection, commit message, reference, or diff behavior. Graph-only graphics SHALL not be the sole carrier of meaning.

#### Scenario: Keyboard selection
- **WHEN** a user navigates commit history with the keyboard
- **THEN** the selected commit and its existing details remain available regardless of graph complexity

### Requirement: Bounded history rendering
The system SHALL calculate and render graph data only for the loaded history window and SHALL preserve pagination behavior for larger repositories.

#### Scenario: Paginated repository history
- **WHEN** repository history loads in multiple pages
- **THEN** each page renders without blocking the UI or invalidating prior selection state
