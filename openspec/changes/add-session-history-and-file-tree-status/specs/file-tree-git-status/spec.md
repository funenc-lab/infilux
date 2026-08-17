## Purpose

Expose the existing Source Control change state directly in the file tree so users can understand
worktree changes without duplicate Git polling or a separate file-status source of truth.

## ADDED Requirements

### Requirement: File and directory status decorations
The system SHALL render Git status decorations for visible file-tree entries using the current
Source Control change result for the same worktree. A changed directory SHALL receive an aggregated
decoration when it contains one or more changed descendants.

#### Scenario: Changed file and parent directory
- **WHEN** Source Control reports a changed file below an expanded directory
- **THEN** the file and every visible ancestor directory display a decoration derived from that
  change result

#### Scenario: Clean worktree
- **WHEN** Source Control reports no changes for the active worktree
- **THEN** the file tree displays no Git status decorations

### Requirement: Deterministic decoration precedence
The system SHALL retain staged and unstaged status information independently and derive one primary
decoration deterministically. For a file, an unstaged status SHALL take precedence over a staged
status when both exist; conflicts SHALL outrank deleted, untracked, added, renamed, modified, and
copied states. Directory decorations SHALL represent the highest-priority descendant state.

#### Scenario: Staged and unstaged changes for one file
- **WHEN** Source Control reports both a staged and an unstaged change for the same file
- **THEN** the file decoration exposes both states and displays the unstaged state as primary

#### Scenario: Conflicted descendant
- **WHEN** a directory contains both modified and conflicted descendants
- **THEN** the directory displays the conflict decoration as its primary state

### Requirement: Repository-aware path matching
The system SHALL match Source Control paths to file-tree paths using the active repository platform
and remote-path semantics. Case-insensitive local file systems and case-sensitive Linux or WSL paths
SHALL produce correct decorations without cross-worktree leakage.

#### Scenario: Remote worktree path
- **WHEN** a remote worktree has an available Source Control change result
- **THEN** its file tree displays decorations only for paths within that remote worktree

#### Scenario: Worktree switch
- **WHEN** the active worktree changes while a previous worktree has cached Source Control data
- **THEN** the newly active file tree does not display decorations from the previous worktree

### Requirement: No additional Git polling source
The system SHALL consume the existing Source Control query and cache key for file-change data. The
file tree SHALL not create an independent Git polling loop or infer that unreported paths are clean
when a change result is truncated.

#### Scenario: Truncated change result
- **WHEN** Source Control reports that its change result is truncated
- **THEN** the file tree decorates only reported paths and does not label unreported entries as clean
