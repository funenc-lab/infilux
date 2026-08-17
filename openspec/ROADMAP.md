# Infilux Upstream Capability Adoption Roadmap

## Scope

This roadmap records every capability selected from the EnsoAI comparison. Each capability has one
OpenSpec change with a proposal, design, behavioral specification, and implementation task list.

| Stage | Capability | OpenSpec Change | Dependency |
| --- | --- | --- | --- |
| 1 | Codex session history and safe rebinding | `add-session-history-and-file-tree-status` | None |
| 1 | File-tree Git status decorations | `add-session-history-and-file-tree-status` | Existing Source Control query |
| 2 | Windows PTY reliability and backend fallback | `harden-windows-pty-runtime` | Existing terminal lifecycle |
| 2 | Commit history graph | `add-commit-history-graph` | Structured Git log data |
| 3 | Session-focus deep links | `add-session-focus-deep-links` | Existing URL scheme and agent session store |
| 3 | Running-agent companion window | `add-running-agent-companion-window` | Session and task read-model projection |
| 3 | Pi and OMP built-in agent support | `extend-built-in-agent-catalog` | CLI detection and agent capability catalog |

## Explicit Non-Goals

- Do not backport EnsoAI features already present in Infilux: remote repositories, Hapi, Web
  Inspector, quick terminal, three-way merge, Git auto-fetch, and todo execution.
- Do not directly copy upstream implementation details that would create a second session, Git, or
  renderer state source.
- Do not start a change until its OpenSpec tasks are reviewed and its dependencies are ready.

## Completion Rules

Every change must pass `openspec validate <change> --strict`, complete every checkbox in its
`tasks.md`, pass its focused tests plus project quality gates, and be archived only after fresh
verification evidence is recorded.
