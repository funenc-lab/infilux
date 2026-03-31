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

- Nearest-directory inheritance applies: use the closest `AGENTS.md` first, then inherit parent guides upward.

### Core runtime layers

- `src/main/AGENTS.md` — Main-process architecture, IPC, lifecycle, and service rules
- `src/preload/AGENTS.md` — Context bridge and `window.electronAPI` extension rules
- `src/renderer/AGENTS.md` — Renderer architecture, state ownership, panels, and UI rules
- `src/shared/AGENTS.md` — Shared types, channel contracts, and cross-process utility rules

### Main-process subdirectories

- `src/main/ipc/AGENTS.md` — Handler boundaries, sender-scoped cleanup, and IPC module design
- `src/main/services/AGENTS.md` — Service-layer ownership, domain separation, and extension rules
- `src/main/services/agent/AGENTS.md` — Agent registry, transcript, and subagent tracking rules
- `src/main/services/ai/AGENTS.md` — AI-assisted generator and review helper rules
- `src/main/services/app/AGENTS.md` — App detection, path validation, and recent-project rules
- `src/main/services/claude/AGENTS.md` — Claude provider, MCP, prompts, plugin, and bridge rules
- `src/main/services/cli/AGENTS.md` — CLI detection and installation support rules
- `src/main/services/files/AGENTS.md` — Privileged file access and watcher lifecycle rules
- `src/main/services/git/AGENTS.md` — Git, worktree, encoding, and runtime helper rules
- `src/main/services/hapi/AGENTS.md` — Hapi runtime, server, and tunnel manager rules
- `src/main/services/proxy/AGENTS.md` — Proxy normalization and configuration rules
- `src/main/services/remote/AGENTS.md` — Remote connection, auth, helper, and runtime asset rules
- `src/main/services/repository/AGENTS.md` — Repository context resolution rules
- `src/main/services/search/AGENTS.md` — Search execution and result-shaping rules
- `src/main/services/session/AGENTS.md` — Session identity, attach, recovery, and persistence rules
- `src/main/services/session/hosts/AGENTS.md` — Host-specific tmux and supervisor adapter rules
- `src/main/services/settings/AGENTS.md` — Main-process settings compatibility and import rules
- `src/main/services/terminal/AGENTS.md` — PTY lifecycle and shell detection rules
- `src/main/services/todo/AGENTS.md` — Todo-domain privileged service rules
- `src/main/services/updater/AGENTS.md` — Auto-update lifecycle and status rules
- `src/main/services/webInspector/AGENTS.md` — Web inspector backend and server lifecycle rules
- `src/main/utils/AGENTS.md` — Main-process utility ownership rules
- `src/main/windows/AGENTS.md` — BrowserWindow creation and window-manager rules

### Renderer subdirectories

- `src/renderer/App/AGENTS.md` — App-shell orchestration, startup, and panel persistence rules
- `src/renderer/App/hooks/AGENTS.md` — Shell-level orchestration hook rules
- `src/renderer/assets/AGENTS.md` — Static renderer asset management rules
- `src/renderer/components/AGENTS.md` — Feature component composition rules
- `src/renderer/components/app/AGENTS.md` — App-scoped renderer widget rules
- `src/renderer/components/chat/AGENTS.md` — Agent panel and chat session UI rules
- `src/renderer/components/chat/agent-panel/AGENTS.md` — Agent-panel leaf subcomponent rules
- `src/renderer/components/files/AGENTS.md` — File tree, Monaco, preview, and editor workflow rules
- `src/renderer/components/git/AGENTS.md` — Git-focused dialog, history, and sync widget rules
- `src/renderer/components/group/AGENTS.md` — Group editing and assignment UI rules
- `src/renderer/components/layout/AGENTS.md` — Shell layout, deferred panels, and sidebar rules
- `src/renderer/components/layout/repository-sidebar/AGENTS.md` — Repository sidebar row and summary rules
- `src/renderer/components/layout/tree-sidebar/AGENTS.md` — Tree sidebar worktree and temp workspace row rules
- `src/renderer/components/layout/worktree-panel/AGENTS.md` — Worktree panel row component rules
- `src/renderer/components/remote/AGENTS.md` — Remote-specific prompt and UI rules
- `src/renderer/components/repository/AGENTS.md` — Repository management dialog rules
- `src/renderer/components/search/AGENTS.md` — Global search dialog and result presentation rules
- `src/renderer/components/settings/AGENTS.md` — Settings shell and section composition rules
- `src/renderer/components/settings/claude-provider/AGENTS.md` — Claude provider settings UI rules
- `src/renderer/components/settings/mcp/AGENTS.md` — MCP server settings UI rules
- `src/renderer/components/settings/plugins/AGENTS.md` — Plugin marketplace and browser UI rules
- `src/renderer/components/settings/prompts/AGENTS.md` — Prompt preset and prompt editor UI rules
- `src/renderer/components/source-control/AGENTS.md` — Source-control panel and diff workflow rules
- `src/renderer/components/temp-workspace/AGENTS.md` — Temporary-workspace dialog and menu rules
- `src/renderer/components/terminal/AGENTS.md` — Terminal panel and terminal view rules
- `src/renderer/components/todo/AGENTS.md` — Todo board and task editor UI rules
- `src/renderer/components/ui/AGENTS.md` — Shared renderer primitive and accessibility rules
- `src/renderer/components/worktree/AGENTS.md` — Worktree dialog and worktree-specific UI rules
- `src/renderer/data/AGENTS.md` — Static renderer dataset rules
- `src/renderer/hooks/AGENTS.md` — Shared renderer hook ownership and cleanup rules
- `src/renderer/lib/AGENTS.md` — Renderer-only utility and model rules
- `src/renderer/stores/AGENTS.md` — Zustand store ownership and state-boundary rules
- `src/renderer/stores/settings/AGENTS.md` — Settings schema, migration, hydration, and storage rules
- `src/renderer/styles/AGENTS.md` — Global renderer style-layer rules
- `src/renderer/utils/AGENTS.md` — Narrow renderer utility ownership rules
- `src/renderer/views/AGENTS.md` — View-level composition rules

### Shared contracts and helpers

- `src/shared/types/AGENTS.md` — Shared domain-type and IPC contract rules
- `src/shared/utils/AGENTS.md` — Shared pure utility and path-normalization rules

### Design and product governance

- `agents/design-context.md` — Persistent product style, brand direction, and visual decision principles
- `agents/theme-palette-policy.md` — Theme hierarchy, semantic color guardrails, and terminal sync policy
- `agents/accessibility-rules.md` — Keyboard, contrast, motion, and dense-UI accessibility expectations
- `agents/motion-principles.md` — Product motion philosophy, hierarchy, and reduced-motion rules
- `agents/interaction-patterns.md` — Navigation, selection, empty-state, dialog, and workflow interaction rules
- `agents/component-governance.md` — Reuse, extraction, variants, layering, and primitive creation rules
- `agents/design-token-governance.md` — Token layers, ownership, overrides, and semantic integrity rules
- `agents/visual-review-checklist.md` — Recurring visual review checklist for context, hierarchy, state, and product character
- `agents/content-copy-guidelines.md` — UI copy tone, label, status, empty-state, and destructive wording rules

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
| Product style intent | `agents/design-context.md` | Read when making visual or brand-level design decisions |
| Theme and palette policy | `agents/theme-palette-policy.md` | Read when changing tokens, color semantics, or sync-terminal behavior |
| Accessibility policy | `agents/accessibility-rules.md` | Read when changing focus, contrast, motion, density, or status presentation |
| Motion policy | `agents/motion-principles.md` | Read when changing transitions, micro-interactions, or panel animation behavior |
| Interaction policy | `agents/interaction-patterns.md` | Read when changing navigation, selection, menus, dialogs, or empty-state behavior |
| Component governance | `agents/component-governance.md` | Read when reusing, extending, extracting, or adding UI components |
| Token governance | `agents/design-token-governance.md` | Read when adding tokens, changing token ownership, or adjusting runtime overrides |
| Visual review checklist | `agents/visual-review-checklist.md` | Read before considering a UI change visually complete or polished |
| Content copy guidelines | `agents/content-copy-guidelines.md` | Read when changing labels, buttons, states, dialogs, empty states, or feedback text |

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
- Follow `agents/design-context.md` for dark-first tone, brand personality, and long-term visual direction.
- Follow `agents/theme-palette-policy.md` for semantic color stability, neutral-base rules, and controlled terminal-theme full sync.
- Follow `agents/accessibility-rules.md` for keyboard access, focus visibility, contrast, motion restraint, and dense-UI readability.
- Follow `agents/motion-principles.md` for animation hierarchy, operational tempo, and reduced-motion-safe interaction behavior.
- Follow `agents/interaction-patterns.md` for context-first navigation, selection clarity, deliberate destructive actions, and action-oriented empty states.
- Follow `agents/component-governance.md` for reuse-first component evolution, correct layering, and disciplined primitive creation.
- Follow `agents/design-token-governance.md` for token layering, source-of-truth clarity, override hierarchy, and semantic token safety.
- Follow `agents/visual-review-checklist.md` to review context clarity, hierarchy, state semantics, and overall product character before shipping UI work.
- Follow `agents/content-copy-guidelines.md` for calm, direct, action-oriented UI wording and consistent destructive/status/empty-state language.
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
- Legacy `EnsoAI` / `enso-ai` identifiers remain only for explicit migration and compatibility paths such as legacy settings import, hook migration, or diagnostics overrides. Do not treat them as the current default app name, runtime state root, or log directory. The active runtime log path is the Infilux path returned by `app.getPath('logs')`, and managed log files use the `infilux-` prefix.
