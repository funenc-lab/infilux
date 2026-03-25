# PROJECT KNOWLEDGE BASE

**Generated:** 2026-03-25
**Commit:** ba8c766
**Branch:** main

These metadata fields are an informational snapshot, not a freshness guarantee. Refresh them only when intentionally updating this project knowledge base.

## OVERVIEW

Infilux is an Electron desktop application for Git worktree management and multi-agent development workflows.

**Stack:** Electron 39, React 19, TypeScript 5.9, Tailwind CSS 4, Zustand, Monaco Editor, xterm.js, simple-git, electron-vite, electron-builder.

## TOP-LEVEL STRUCTURE

```text
Infilux/
├── src/
│   ├── main/       # Electron main process: app lifecycle, IPC, native services
│   ├── preload/    # Context bridge: typed renderer-facing Electron API
│   ├── renderer/   # React UI, stores, hooks, panels, feature components
│   └── shared/     # Cross-process types and pure utilities
├── resources/      # Static resources, including generated Ghostty themes
├── scripts/        # Development/build helper scripts
├── docs/           # Product and engineering documentation
└── build/          # Electron Builder assets
```

## SUBSYSTEM GUIDES

- `src/main/AGENTS.md` — Main-process architecture, IPC, lifecycle, and service rules
- `src/renderer/AGENTS.md` — Renderer architecture, state ownership, panels, and UI rules
- `src/preload/AGENTS.md` — Context bridge and `window.electronAPI` extension rules
- `src/shared/AGENTS.md` — Shared types, channel contracts, and cross-process utility rules

## SYSTEM ARCHITECTURE

### Process boundaries

```text
Renderer UI
  -> window.electronAPI (preload bridge)
    -> IPC channels and push events
      -> Main-process handlers
        -> Native/system services
```

### Core feature slices

- **Git and worktrees:** `src/main/services/git/`, `src/main/ipc/git.ts`, `src/main/ipc/worktree.ts`
- **Editor and file navigation:** `src/renderer/components/files/`, `src/renderer/stores/editor.ts`, `src/renderer/stores/navigation.ts`
- **Terminal and agent sessions:** `src/main/services/session/`, `src/main/services/terminal/`, `src/renderer/hooks/useXterm.ts`, `src/renderer/components/chat/`
- **Remote repositories:** `src/main/services/remote/`, `src/main/ipc/remote.ts`, `src/renderer/components/remote/`
- **Claude integration and MCP-related flows:** `src/main/services/claude/`, `src/main/ipc/claude*.ts`, `src/renderer/components/settings/claude-provider/`, `src/renderer/components/settings/mcp/`
- **Search, todo, temp workspace, web inspector:** domain folders exist in both main and renderer; extend them by domain rather than by ad hoc cross-cutting code

## WHERE TO LOOK

| Task | Primary location | Notes |
|------|------------------|-------|
| Add or change IPC behavior | `src/shared/types/ipc.ts` -> `src/main/ipc/*.ts` -> `src/preload/index.ts` | Keep the contract aligned across all three layers |
| Main-process service logic | `src/main/services/<domain>/` | Prefer services over large handlers |
| Renderer state ownership | `src/renderer/stores/*.ts` | Check existing store boundaries before adding state |
| Renderer async orchestration | `src/renderer/hooks/*.ts` | Shared logic belongs in hooks, not panels |
| Editor flows | `src/renderer/components/files/` | `EditorArea.tsx` is the main hotspot |
| Layout and cross-panel routing | `src/renderer/components/layout/`, `src/renderer/App/` | Keep navigation semantics consistent |
| Shared types and payloads | `src/shared/types/` | Avoid process-specific imports here |
| Electron bridge surface | `src/preload/index.ts` | Renderer should not import Electron directly |
| Tests | `src/**/__tests__/**/*.test.ts` | Vitest is available for targeted unit tests |
| UI rules | `docs/design-system.md` | Read before building or changing UI |

## KEY HOTSPOTS

- `src/renderer/App.tsx` is still a large orchestration entry.
- `src/renderer/components/files/EditorArea.tsx` carries editor, preview, blame, and external-change behavior.
- `src/renderer/components/layout/TreeSidebar.tsx` and `src/renderer/components/files/FileTree.tsx` are large UI hotspots.
- `src/main/services/remote/RemoteConnectionManager.ts` and `RemoteHelperSource.ts` are major remote-runtime hotspots.
- `src/main/index.ts` and `src/main/ipc/index.ts` are lifecycle-sensitive and easy to destabilize.

Treat changes in these files as architecture changes, not local edits.

## CROSS-CUTTING RULES

### State ownership

- Do not introduce a parallel state source when a current store already owns the concern.
- `editor.ts` owns open tabs, active file, pending cursor, and per-worktree editor session state.
- `navigation.ts` is a one-shot navigation bus, not durable editor state.
- File-tree expansion and lazy loading belong to `useFileTree.ts`, not to editor state.
- Worktree switches, app-close flows, and external file changes are critical paths; preserve them when refactoring editor code.

### IPC and contract discipline

- New IPC capability must update shared channel/type definitions, main handlers, preload bridge, and renderer call sites together.
- Prefer typed payload objects over positional argument growth once a handler becomes non-trivial.
- Keep main-process return values serializable and explicit.

### UI and styling

- Prefer existing `@coss/ui` components in `src/renderer/components/ui/` before creating new primitives.
- Follow `docs/design-system.md` for spacing, tokens, and interaction patterns.
- Preserve truncation safety in flex layouts with `min-w-0`, `flex-1`, and `shrink-0` where appropriate.

### File-system and path handling

- File features must consider both local paths and remote virtual paths.
- Do not assume every file operation is local-disk-only.
- Watcher and cleanup logic must release resources on window destroy and app shutdown.

## ANTI-PATTERNS

- Using `as any`, `@ts-ignore`, or other type escape hatches
- Adding Electron or Node access directly inside renderer components
- Adding a new navigation/state mechanism instead of extending existing stores/hooks
- Copy-pasting editor or panel logic across `FilePanel`, `CurrentFilePanel`, or related components
- Loading Monaco workers from a CDN or otherwise bypassing local worker setup
- Hardcoding theme values instead of reusing tokens and theme synchronization
- Modifying lifecycle-sensitive cleanup paths without checking shutdown behavior

## QUALITY GATES

```bash
pnpm typecheck
pnpm lint
pnpm test
```

Use narrower test commands when appropriate, but do not claim success without fresh verification output.

The project-standard package manager is `pnpm`. If `pnpm` is unavailable in the execution environment, use the equivalent workspace package-manager command without changing the intended verification scope.

## CURRENT REALITY CHECKS

- The project now has Vitest-based targeted tests; do not assume there is no automated testing.
- `src/renderer/stores/settings.ts` is a compatibility re-export. The modularized implementation lives under `src/renderer/stores/settings/`.
- File, terminal, and source-control panels stay mounted during tab switches; hidden panels still retain runtime state.
- Remote and local repository flows coexist in the same app. Design new features with that duality in mind.
