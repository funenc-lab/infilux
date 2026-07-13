# Project Configuration Schemes Design

## Goal

Add reusable project configuration schemes that can be selected by a repository or a worktree.
Each scheme can define a skill policy, MCP policy, and prompt preset. Repository and worktree
selection stores only the selected scheme ID, so scheme edits apply dynamically to future sessions.

## Confirmed Approach

The first implementation uses dynamic templates:

- Schemes are global reusable settings objects.
- A repository may select one scheme.
- A worktree may select one scheme.
- Worktree selection overrides repository selection.
- Existing direct project/worktree policy edits remain supported and override scheme policy.
- Running sessions are not hot-updated; affected sessions are marked stale and require restart.

## Scope

In scope:

- Define a shared `ProjectConfigScheme` model.
- Persist schemes in the settings store.
- Persist repository and worktree scheme selections with existing renderer app storage.
- Resolve effective project/worktree Claude policy by combining selected scheme policy with direct policy.
- Resolve effective prompt content for new sessions from the selected scheme prompt preset.
- Add a settings surface to create, edit, and delete schemes.
- Add repository and worktree selection helpers for future UI entry points.

Out of scope for the first implementation:

- Writing scheme prompt content to global `CLAUDE.md`.
- Copying scheme contents into repository or worktree policy storage.
- Hot-updating running sessions.
- Provider-specific UI beyond the existing capability policy pipeline.
- Organization-level locked policy enforcement.

## Architecture

The feature reuses the current capability policy pipeline instead of introducing a parallel runtime.
Schemes are settings-level reusable templates, while repository/worktree selections live beside the
existing repository and worktree policy storage.

Resolution chain:

```text
global policy
-> selected repository scheme policy
-> direct repository policy
-> selected worktree scheme policy
-> direct worktree policy
-> session policy
```

Prompt resolution:

```text
selected worktree scheme prompt preset
-> selected repository scheme prompt preset
-> no scheme prompt
```

The prompt is passed as the new session initial prompt. It is not written to global prompt files.

## Data Model

`ProjectConfigScheme` contains:

- `id`
- `name`
- `description`
- `claudePolicy`
- `promptPresetId`
- `createdAt`
- `updatedAt`

`ProjectConfigSchemeSelection` contains:

- `schemeId`
- `updatedAt`

Repository selections are keyed by normalized repository path. Worktree selections are keyed by
normalized worktree path and include the parent repository path for stale-session targeting.

## Error Handling

- Missing scheme IDs resolve to no scheme.
- Missing prompt preset IDs resolve to no prompt.
- Deleted schemes clear nothing automatically; stale selections become inert until changed.
- Invalid persisted selection shapes are ignored during read.
- Empty direct policies remain `null` and do not mask scheme policies.

## Extension Points

- Add provider-specific prompt adapters later if Codex or Gemini need different prompt injection.
- Add import/export for schemes without changing repository/worktree selection storage.
- Add scheme provenance to policy preview if users need to see whether a decision came from a scheme
  or from direct policy.
- Add lock/enforcement semantics as a separate policy layer if organization controls are required.

## Testing

Targeted tests should cover:

- Scheme normalization and policy merge behavior.
- Repository/worktree selection storage normalization.
- Prompt resolution from worktree and repository schemes.
- Settings migration preserving existing MCP and prompt settings while adding schemes.
- Agent launch metadata using scheme-resolved policy and initial prompt.
