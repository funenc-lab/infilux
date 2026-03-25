# RENDERER PROCESS GUIDE

The renderer is a React 19 application responsible for UI composition, local interaction state, and orchestration of preload-exposed APIs.

This guide extends, and does not replace, the root `AGENTS.md`.

## RESPONSIBILITIES

- Compose panels, dialogs, and feature surfaces
- Own renderer-local state with Zustand stores
- Orchestrate async UI flows with hooks and React Query where applicable
- Render Monaco, xterm.js, git views, settings, and agent interactions
- Consume `window.electronAPI` without importing Electron directly

## HIGH-LEVEL STRUCTURE

```text
renderer/
├── App.tsx                 # App shell and global orchestration hotspot
├── App/                    # Cross-panel app hooks and utilities
├── components/
│   ├── layout/             # Main shell, sidebars, action areas
│   ├── files/              # File tree, editor tabs, Monaco, previews
│   ├── chat/               # Agent panel, session UI, agent terminals
│   ├── source-control/     # Diff and source-control flows
│   ├── settings/           # Settings surfaces, provider and MCP UI
│   ├── remote/             # Remote connection UI
│   ├── repository/         # Repository-specific UI
│   ├── terminal/           # Shell terminal UI
│   ├── todo/               # Todo feature UI
│   └── ui/                 # Shared UI primitives and wrappers
├── hooks/                  # Shared behavioral units
├── stores/                 # Zustand domain stores
└── lib/                    # Pure renderer helpers
```

## STATE OWNERSHIP

### Existing stores matter more than convenience

Check existing ownership before creating state.

- `editor.ts` owns tabs, active file, pending cursor, current cursor line, and per-worktree editor session state.
- `navigation.ts` is a transient cross-module request bus for opening/focusing files.
- `terminal.ts`, `terminalWrite.ts`, and session-related stores own terminal/session UI state.
- `settings.ts` is a compatibility entry point. The real implementation lives in `stores/settings/`.
- `repository.ts`, `worktree.ts`, `worktreeActivity.ts`, `sourceControl.ts`, `todo.ts`, and related stores are domain-specific and should remain focused.

If a new feature overlaps an existing store, extend that store or extract shared logic. Do not create a parallel source of truth.

## KEY FLOWS

### File navigation and editor

```text
User action
  -> navigation/editor store update
    -> panel selection / active tab update
      -> EditorArea renders Monaco or preview state
```

Relevant files:
- `components/files/FilePanel.tsx`
- `components/files/CurrentFilePanel.tsx`
- `components/files/EditorArea.tsx`
- `stores/editor.ts`
- `stores/navigation.ts`
- `hooks/useFileTree.ts`

Rules:
- Preserve worktree-aware editor restoration.
- Preserve external file change handling.
- Preserve app-close dirty-file prompts.
- Treat local and remote file paths as first-class scenarios.

### Terminal and agent session flow

- `hooks/useXterm.ts` is the main xterm.js integration hotspot.
- `components/chat/` and `components/terminal/` should stay presentation-focused when possible.
- Session and terminal lifecycle must align with main-process session/pty behavior.

### Worktree switch and app lifecycle flow

- `App/hooks/useWorktreeSelection.ts` is the key entry for worktree-switch coordination.
- `App/hooks/useAppLifecycle.ts` owns app-close and dirty-state coordination.
- `stores/worktreeActivity.ts` tracks worktree-scoped runtime activity such as terminal cleanup entry points.
- `stores/agentSessions.ts` owns agent session UI state and should stay distinct from terminal state.

Do not reimplement these flows inside panel components unless a deliberate architecture change is being made.

### Layout and mounting behavior

Panels remain mounted when hidden. Do not assume switching tabs resets child state.

This affects:
- terminal lifetime
- editor state
- source-control state
- subscriptions and effect cleanup

## WHERE TO LOOK

| Task | Primary location | Notes |
|------|------------------|-------|
| App-wide layout or panel routing | `App.tsx`, `components/layout/` | Check keep-mounted behavior first |
| Worktree switch lifecycle | `App/hooks/useWorktreeSelection.ts`, `stores/worktree.ts`, `stores/editor.ts` | Preserve unsaved-change handling |
| App close and dirty-state flow | `App/hooks/useAppLifecycle.ts`, `stores/editor.ts`, `stores/unsavedPrompt.ts` | High-risk orchestration path |
| File tree logic | `hooks/useFileTree.ts`, `components/files/FileTree.tsx` | Keep lazy loading and reveal behavior intact |
| Editor behavior | `components/files/EditorArea.tsx`, `stores/editor.ts` | High-risk area |
| Terminal behavior | `hooks/useXterm.ts`, `hooks/useTerminal.ts`, `components/terminal/` | Preserve resize/activity behavior |
| Agent session UI state | `stores/agentSessions.ts`, `components/chat/` | Keep agent/session state distinct from PTY transport |
| Source control | `components/source-control/`, `hooks/useSourceControl.ts` | Check git IPC call patterns |
| Remote-aware UI | `components/remote/`, `hooks/useRepositoryRuntimeContext.ts` | Do not assume local-only repositories |
| Settings | `components/settings/`, `stores/settings/` | Prefer modular additions |
| Tests | `src/renderer/**/__tests__/**/*.test.ts` | Vitest runs in node environment |

## UI AND STYLING RULES

- Use existing `components/ui/` and `@coss/ui` abstractions before creating new primitives.
- Follow `docs/design-system.md` for tokens, spacing, and sizing.
- Prefer semantic tokens such as `text-primary`, `bg-accent`, and `text-muted-foreground`.
- Preserve flex truncation safety with `min-w-0`, `flex-1`, `truncate`, and `shrink-0`.
- Avoid hardcoded colors unless the surrounding code already uses a specific color mapping for file-type icons or equivalent intentional semantics.

## EXTENSION POINTS

### Adding a new renderer feature

1. Decide whether it is panel-level, dialog-level, or inline UI.
2. Reuse an existing domain folder if the feature belongs to one.
3. Put reusable async behavior in a hook.
4. Put shared mutable UI state in the smallest correct store.
5. Add or extend preload/main/shared contracts only if renderer truly needs a new platform capability.

### Adding a new file-opening entry point

Prefer emitting or consuming the existing navigation semantics rather than wiring a bespoke path directly into panel internals.

### Extending settings

- Add types/defaults/storage or migration support inside `stores/settings/`.
- Keep `stores/settings.ts` as a stable compatibility surface unless a coordinated refactor is underway.

## ANTI-PATTERNS

- Importing `electron`, `node:*`, or other main-only APIs directly into renderer code
- Copying panel logic instead of extracting shared hooks/components
- Introducing another file-navigation mechanism outside current editor/navigation flows
- Hiding async orchestration inside deeply nested presentational components
- Assuming unmount/remount semantics for panels that are intentionally kept alive
- Treating remote paths as an edge case instead of a supported mode

## VERIFICATION

Use these commands after meaningful renderer changes:

```bash
pnpm typecheck
pnpm lint
pnpm test
```

For focused work, run a narrower Vitest target that covers the touched renderer files in addition to the broader checks when appropriate.
