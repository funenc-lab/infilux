# Infilux Feature Inventory

## Purpose

This inventory is the project-level map from product features to code ownership, contracts,
tests, and governing documentation. It complements `AGENTS.md`, `docs/architecture.md`, and
nearest-directory `AGENTS.md` files.

Use this document when planning, reviewing, or auditing feature work. Keep implementation details
in source-level guides and architecture docs; keep this file focused on ownership and traceability.

## Maintenance Rules

- Update this inventory when adding a feature surface, a new main-process service, a new shared IPC
  contract, or a new durable renderer state owner.
- Keep entries tied to stable directories and contracts instead of individual private helper
  functions.
- If a feature is only planned or historical, keep it under `docs/superpowers/` and do not add it
  here until it has an implementation path in source code.
- Treat the nearest `AGENTS.md` as the behavioral authority for a directory; this inventory is an
  index, not a replacement.

## Feature Matrix

| Feature area | User-facing scope | Renderer ownership | Main-process ownership | Shared contracts | Primary tests | Governing docs |
|---|---|---|---|---|---|---|
| App shell, panel routing, and startup | Main window, sidebars, tabs, deferred panels, startup overlays, keyboard shortcuts | `src/renderer/App/`, `src/renderer/components/layout/`, `src/renderer/stores/` | `src/main/index.ts`, `src/main/windows/`, `src/main/services/MenuBuilder.ts`, `src/main/services/TrayService.ts` | `src/shared/types/menu.ts`, `src/shared/types/app.ts`, `src/shared/types/ipc.ts` | `src/renderer/App/__tests__/`, `src/renderer/components/layout/__tests__/`, `src/main/services/__tests__/` | `AGENTS.md`, `src/renderer/App/AGENTS.md`, `src/renderer/components/layout/AGENTS.md` |
| Repository and worktree management | Repository list, worktree creation/removal, branch selection, workspace canvas | `src/renderer/components/repository/`, `src/renderer/components/worktree/`, `src/renderer/components/layout/worktree-panel/`, `src/renderer/stores/repository.ts` | `src/main/services/git/`, `src/main/services/repository/`, `src/main/ipc/git.ts`, `src/main/ipc/worktree.ts` | `src/shared/types/git.ts`, `src/shared/types/worktree.ts`, `src/shared/types/repositoryContext.ts` | `src/main/ipc/__tests__/git.test.ts`, `src/main/ipc/__tests__/worktree.test.ts`, `src/renderer/components/worktree/__tests__/`, `src/renderer/App/__tests__/worktree*.test.ts` | `src/main/services/git/AGENTS.md`, `src/main/services/repository/AGENTS.md`, `src/renderer/components/worktree/AGENTS.md` |
| Editor, file tree, and preview | File explorer, Monaco editor, tabs, previews, breadcrumbs, external-change handling | `src/renderer/components/files/`, `src/renderer/stores/editor.ts`, `src/renderer/stores/navigation.ts`, `src/renderer/hooks/useEditor.ts`, `src/renderer/hooks/useFileTree.ts` | `src/main/services/files/`, `src/main/ipc/files.ts`, `src/main/ipc/fileUtils.ts`, `src/main/ipc/fileListPolicy.ts` | `src/shared/types/file.ts`, `src/shared/types/ipc.ts` | `src/renderer/components/files/__tests__/`, `src/renderer/stores/__tests__/editorWorktreeState.test.ts`, `src/main/ipc/__tests__/files*.test.ts` | `docs/editor-architecture.md`, `src/renderer/components/files/AGENTS.md`, `src/main/services/files/AGENTS.md` |
| Terminal sessions | Integrated terminal panels, quick terminal, PTY IO, shell detection | `src/renderer/components/terminal/`, `src/renderer/components/chat/QuickTerminal*.tsx`, `src/renderer/hooks/useXterm.ts` | `src/main/services/terminal/`, `src/main/services/session/`, `src/main/ipc/terminal.ts`, `src/main/ipc/session.ts`, `src/main/ipc/tmux.ts` | `src/shared/types/terminal.ts`, `src/shared/types/session.ts`, `src/shared/types/tmux.ts` | `src/renderer/components/terminal/__tests__/`, `src/renderer/hooks/__tests__/useXterm.test.ts`, `src/main/ipc/__tests__/session.test.ts` | `src/main/services/terminal/AGENTS.md`, `src/main/services/session/AGENTS.md`, `src/renderer/components/terminal/AGENTS.md` |
| Agent sessions and recovery | Agent chat/canvas, persistent local recovery, subagent visibility, transcripts, input attachments | `src/renderer/components/chat/`, `src/renderer/stores/agentSessions.ts`, `src/renderer/stores/agentSessionInventory.ts`, `src/renderer/hooks/useSessionSubagents*.ts` | `src/main/services/agent/`, `src/main/services/session/`, `src/main/ipc/agent*.ts`, `src/main/ipc/agentSession.ts`, `src/main/ipc/agentSubagent.ts` | `src/shared/types/agent*.ts`, `src/shared/types/agentSession.ts`, `src/shared/types/agentSubagent.ts`, `src/shared/types/agentInput.ts` | `src/renderer/components/chat/__tests__/`, `src/renderer/stores/__tests__/agentSessions*.test.ts`, `src/main/services/agent/__tests__/`, `e2e/agent-session-recovery.test.ts` | `src/renderer/components/chat/AGENTS.md`, `src/main/services/agent/AGENTS.md`, `src/main/services/session/AGENTS.md` |
| Agent provider configuration | Provider profile settings, detected CLI config, provider config watchers | `src/renderer/components/settings/agent-provider/`, `src/renderer/hooks/useAgentProviderSessionDiscovery.ts` | `src/main/services/agentProvider/`, `src/main/ipc/claudeProvider.ts` | `src/shared/types/agentProviderProfile.ts`, `src/shared/types/ai.ts`, `src/shared/types/ipc.ts` | `src/main/services/agentProvider/__tests__/`, `src/renderer/components/settings/__tests__/agentProvider*.test.ts`, `src/renderer/hooks/__tests__/useAgentProviderSessionDiscovery.test.ts` | `src/main/services/agentProvider/AGENTS.md`, `src/renderer/components/settings/agent-provider/AGENTS.md` |
| Claude, MCP, prompts, plugins, and policy | Claude provider settings, MCP servers, prompt presets, plugin browser, capability and native skill policy | `src/renderer/components/settings/claude-provider/`, `src/renderer/components/settings/mcp/`, `src/renderer/components/settings/prompts/`, `src/renderer/components/settings/plugins/`, `src/renderer/components/settings/claude-policy/` | `src/main/services/claude/`, `src/main/ipc/claude*.ts` | `src/shared/types/claude.ts`, `src/shared/types/claudePolicy.ts`, `src/shared/types/mcp.ts`, `src/shared/types/plugins.ts`, `src/shared/types/prompts.ts` | `src/main/ipc/__tests__/claude*.test.ts`, `src/renderer/components/settings/claude-policy/__tests__/`, `src/renderer/components/settings/__tests__/agentIntegration*.test.ts`, `e2e/capability-policy.test.ts` | `src/main/services/claude/AGENTS.md`, `src/renderer/components/settings/claude-policy/AGENTS.md`, `src/renderer/components/settings/mcp/AGENTS.md` |
| AI Center and todo execution | Cross-project task overview, dispatch recommendations, todo board, task editing | `src/renderer/components/ai-center/`, `src/renderer/components/todo/`, `src/renderer/stores/todo.ts` | `src/main/services/todo/`, `src/main/ipc/todo.ts` | `src/shared/types/todo.ts` | `src/renderer/components/ai-center/__tests__/`, `src/renderer/components/todo/__tests__/`, `src/renderer/stores/__tests__/todoStore.test.ts`, `src/main/services/todo/` tests when service behavior changes | `src/renderer/components/ai-center/AGENTS.md`, `src/renderer/components/todo/AGENTS.md`, `src/main/services/todo/AGENTS.md` |
| Source control, diff, merge, and AI review | Git status, staging, diffs, merge flows, AI commit/review helpers | `src/renderer/components/source-control/`, `src/renderer/components/git/`, `src/renderer/App/hooks/useMergeState.ts`, `src/renderer/App/hooks/useCodeReviewContinue.ts` | `src/main/services/git/`, `src/main/services/ai/`, `src/main/ipc/git.ts` | `src/shared/types/git.ts`, `src/shared/types/ai.ts` | `src/renderer/components/source-control/__tests__/`, `src/main/ipc/__tests__/git.test.ts`, targeted AI helper tests when behavior changes | `src/renderer/components/source-control/AGENTS.md`, `src/renderer/components/git/AGENTS.md`, `src/main/services/ai/AGENTS.md` |
| Remote repositories | Remote connection profiles, SSH auth, runtime install, remote filesystem/Git/worktree/session support | `src/renderer/components/remote/`, remote-aware consumers in files, settings, terminal, and repository views | `src/main/services/remote/`, `src/main/ipc/remote.ts` | `src/shared/types/remote.ts`, `src/shared/types/repositoryContext.ts`, remote path utilities | Remote service/unit tests, `docs/remote-acceptance-checklist.md`, targeted renderer remote tests where flows are touched | `docs/remote-architecture.md`, `src/main/services/remote/AGENTS.md`, `src/renderer/components/remote/AGENTS.md` |
| Search | Global search dialog, search result navigation, local and remote repository search | `src/renderer/components/search/`, `src/renderer/stores/navigation.ts` | `src/main/services/search/`, `src/main/ipc/search.ts` | `src/shared/types/search.ts` | `src/renderer/components/search/__tests__/`, service or IPC tests when query shaping changes | `src/main/services/search/AGENTS.md`, `src/renderer/components/search/AGENTS.md` |
| Temporary workspace | Temporary workspace creation, tree/sidebar entries, persistence and cleanup | `src/renderer/components/temp-workspace/`, `src/renderer/components/layout/tree-sidebar/`, `src/renderer/stores/tempWorkspace.ts` | `src/main/ipc/tempWorkspace.ts`, `src/main/ipc/tempWorkspacePersistence.ts` | `src/shared/types/tempWorkspace.ts` | `src/main/ipc/__tests__/tempWorkspace*.test.ts`, `src/renderer/components/temp-workspace/__tests__/`, `src/renderer/stores/__tests__/tempWorkspaceStore.test.ts` | `src/renderer/components/temp-workspace/AGENTS.md` |
| Token usage and resource monitoring | Project token usage summary, drawer, popover, app resource manager | `src/renderer/components/layout/ProjectTokenUsageSummary.tsx`, `TokenUsageDrawer.tsx`, `TokenUsagePopover.tsx`, `AppResourceManagerDrawer.tsx` | `src/main/services/tokenUsage/`, `src/main/ipc/tokenUsage.ts`, app resource services | `src/shared/types/tokenUsage.ts`, `src/shared/utils/tokenUsage.ts` | `src/main/services/tokenUsage/__tests__/`, `src/main/ipc/__tests__/tokenUsage.test.ts`, `src/renderer/components/layout/__tests__/tokenUsage*.test.ts` | `src/main/services/tokenUsage/AGENTS.md`, `src/renderer/components/layout/AGENTS.md` |
| Settings and preferences | General, appearance, editor, input, keybindings, AI, integrations, remote, Hapi, web inspector | `src/renderer/components/settings/`, `src/renderer/stores/settings/` | `src/main/services/settings/`, `src/main/ipc/settings.ts` | `src/shared/types/settingsImport.ts`, settings-related shared contracts | `src/renderer/components/settings/__tests__/`, `src/renderer/stores/settings/`, `src/main/ipc/__tests__/settings.test.ts` | `src/renderer/components/settings/AGENTS.md`, `src/renderer/stores/settings/AGENTS.md`, `src/main/services/settings/AGENTS.md` |
| Hapi runtime and tunnels | Hapi runner, local server, Cloudflare tunnel settings/status | `src/renderer/components/settings/HapiSettings.tsx` and related status consumers | `src/main/services/hapi/`, `src/main/ipc/hapi.ts` | `src/shared/types/ipc.ts` and Hapi-related payloads | `src/main/ipc/__tests__/hapi.test.ts`, service tests when lifecycle changes | `src/main/services/hapi/AGENTS.md` |
| Web inspector | Managed web inspector server, settings, user script support | `src/renderer/components/settings/WebInspectorSettings.tsx` | `src/main/services/webInspector/`, `src/main/ipc/webInspector.ts`, `scripts/web-inspector.user.js` | `src/shared/types/webInspector.ts` | Web inspector service/IPC tests when server lifecycle changes | `src/main/services/webInspector/AGENTS.md` |
| CLI detection and installation | CLI availability, tmux detection, install support | Settings and status surfaces that consume CLI state | `src/main/services/cli/`, `src/main/ipc/cli.ts` | `src/shared/types/cli.ts` | `src/main/ipc/__tests__/cli.test.ts` and service tests when detection changes | `src/main/services/cli/AGENTS.md` |
| Update, release, diagnostics, and automation | Update notification, release builds, diagnostics collection, workflow checks | `src/renderer/components/UpdateNotification.tsx`, settings diagnostics surfaces | `src/main/services/updater/`, `src/main/ipc/updater.ts`, `scripts/`, `.github/workflows/` | `src/shared/types/updater.ts`, `src/shared/types/log.ts` | `src/renderer/components/__tests__/UpdateNotification.test.ts`, `scripts/__tests__/`, updater tests when lifecycle changes | `.github/AGENTS.md`, `scripts/AGENTS.md`, `src/main/services/updater/AGENTS.md` |

## Architecture Coverage Checklist

Use this checklist before considering a feature context complete:

- **User entry**: the primary renderer panel, dialog, sidebar entry, setting, or command is identified.
- **State owner**: durable state has one owner in a store, service, repository, or settings module.
- **Process boundary**: new main-process capability follows shared type -> main IPC -> preload -> renderer.
- **Remote behavior**: local-only, remote-aware, or remote-excluded behavior is explicit.
- **Recovery behavior**: app restart, window close, worktree switch, and hidden-panel retention are considered.
- **Design authority**: relevant design, interaction, accessibility, motion, and copy guides are linked or inherited.
- **Quality gate**: targeted unit, integration, E2E, or script tests are identified.

## Design And UX Governance

Feature work that changes visible UI must inherit the root design governance:

- `docs/design-system.md`
- `agents/design-context.md`
- `agents/theme-palette-policy.md`
- `agents/accessibility-rules.md`
- `agents/motion-principles.md`
- `agents/interaction-patterns.md`
- `agents/component-governance.md`
- `agents/design-token-governance.md`
- `agents/visual-review-checklist.md`
- `agents/content-copy-guidelines.md`

For UI changes, the nearest renderer `AGENTS.md` defines local ownership; these governance files
define product-wide quality expectations.

## Quality Gates

Default gates remain:

```bash
pnpm typecheck
pnpm lint
pnpm test
```

Use narrower commands for focused changes, but do not claim a gate passed without fresh output.

Additional gates by change type:

- **Electron E2E**: `pnpm test:e2e` after building paths that affect app launch, recovery, policy, or cross-window lifecycle.
- **Test quality**: `pnpm test:quality` when adding or moving tests.
- **Theme/color policy**: `pnpm lint:theme` when changing renderer colors or theme tokens.
- **Release/workflow automation**: focused tests under `scripts/__tests__/` plus workflow diff review.

## Current Known High-Risk Areas

- `src/renderer/App.tsx` and `src/renderer/App/` orchestration hooks.
- `src/renderer/components/layout/MainContent*.tsx` and deferred panel retention policies.
- `src/renderer/components/files/EditorArea.tsx` and editor/worktree state interactions.
- `src/renderer/components/chat/AgentPanel.tsx`, `AgentTerminal.tsx`, and agent session recovery models.
- `src/main/index.ts`, `src/main/ipc/index.ts`, and shutdown cleanup paths.
- `src/main/services/remote/RemoteConnectionManager.ts` and `RemoteHelperSource.ts`.
- `src/main/services/session/` and `src/main/services/terminal/` where PTY/session ownership overlaps.

Treat edits in these areas as architecture-sensitive and verify both lifecycle and regression behavior.
