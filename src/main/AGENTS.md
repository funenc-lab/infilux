# MAIN PROCESS GUIDE

The main process owns Electron lifecycle, IPC registration, native integrations, background services, and cleanup.

This guide extends, and does not replace, the root `AGENTS.md`.

## RESPONSIBILITIES

- Boot the Electron app and create windows
- Register all IPC handlers
- Bridge renderer requests to native/system capabilities
- Manage long-lived services and external processes
- Enforce cleanup on normal shutdown and signal-based termination

## HIGH-LEVEL STRUCTURE

```text
main/
├── index.ts                 # App bootstrap, window lifecycle, shutdown coordination
├── ipc/                     # Domain-specific IPC handlers and resource cleanup entry points
├── services/
│   ├── git/                 # Git, worktree, safe-directory, runtime helpers
│   ├── session/             # Agent/shell session orchestration
│   ├── terminal/            # PTY process management
│   ├── remote/              # Remote connection, helper, runtime asset orchestration
│   ├── claude/              # Claude bridge, provider, prompts, plugins, MCP support
│   ├── app/                 # App detection, path validation, recent projects
│   ├── files/               # File watcher and local file access services
│   ├── search/              # Search services
│   ├── updater/             # Auto-update support
│   ├── webInspector/        # Web inspector backend
│   └── ...                  # Additional domain services
└── utils/                   # Shared main-process helpers
```

## IPC DESIGN RULES

### Canonical extension path

```text
src/shared/types/ipc.ts
  -> src/main/ipc/<domain>.ts
    -> src/preload/index.ts
      -> renderer consumer
```

Rules:
- Add a shared channel constant first.
- Keep handler registration inside a domain IPC module.
- Register the handler in `src/main/ipc/index.ts`.
- Expose the capability through preload before using it in renderer code.
- Prefer structured payload objects once a method has more than one or two meaningful parameters.

### Handler boundaries

IPC handlers should stay thin.

Move business logic to services when:
- the handler grows beyond straightforward argument validation and delegation
- the logic is reused by more than one handler
- the logic manages lifecycle, caching, external processes, or security-sensitive state

## LIFECYCLE AND CLEANUP

### Critical files

- `src/main/index.ts`
- `src/main/ipc/index.ts`
- `src/main/services/terminal/PtyManager.ts`
- `src/main/services/session/SessionManager.ts`
- `src/main/ipc/files.ts`
- `src/main/services/remote/RemoteConnectionManager.ts`
- `src/main/services/claude/ClaudeIdeBridge.ts`

### Cleanup invariants

- App shutdown must release PTYs, remote connections, file watchers, temporary files, and long-lived services.
- Normal app shutdown uses async cleanup.
- Signal-based shutdown uses synchronous cleanup fallbacks.
- Do not change cleanup ordering casually; shutdown bugs here can crash Electron or leak child processes.

When changing cleanup logic, verify both:
- graceful shutdown behavior
- forced shutdown / signal handling behavior

## DOMAIN HOTSPOTS

### Remote runtime

`services/remote/` is large and highly stateful.

Guidelines:
- Treat remote connection state transitions as architecture-sensitive.
- Keep local-path and remote-virtual-path logic consistent.
- Preserve reconnection, helper installation, and auth prompt behavior.

### Sessions and terminals

- `services/session/SessionManager.ts` coordinates session lifecycle.
- `services/terminal/PtyManager.ts` manages PTY creation, resize, data, and destruction.
- Session and PTY cleanup must remain aligned.

Boundary rules:
- `session` owns session identity, attach/detach, lifecycle state, and high-level session coordination.
- `terminal` owns PTY process creation, resize, IO streaming, and destruction.
- `agent` owns agent metadata, registry concerns, stop/status notifications, and agent-specific orchestration.
- Do not move session concerns into PTY code or PTY concerns into agent registries.

### Files and watchers

- `ipc/files.ts` handles both local and remote file flows.
- Watcher ownership and cleanup are tied to sender/webContents lifetime.
- Do not assume a file feature only touches local disk.

### Claude and agent integrations

- Keep provider, prompt, plugin, completion, and bridge concerns separated by service.
- `ClaudeIdeBridge.ts` is a core integration point; avoid mixing unrelated logic into it.

## WHERE TO LOOK

| Task | Primary location | Notes |
|------|------------------|-------|
| Add a new IPC capability | `ipc/<domain>.ts`, `ipc/index.ts`, `@shared/types/ipc.ts` | Update all layers |
| App startup or window lifecycle | `index.ts` | High-risk area |
| Git/worktree changes | `services/git/`, `ipc/git.ts`, `ipc/worktree.ts` | Preserve authorization and repository boundaries |
| Session or PTY behavior | `services/session/`, `services/terminal/`, `ipc/session.ts` | Cleanup-sensitive |
| Agent registry or status flows | `services/agent/`, `ipc/agent.ts` | Keep agent concerns separate from PTY internals |
| Terminal IPC behavior | `ipc/terminal.ts`, `services/terminal/` | Keep transport and lifecycle aligned |
| File reading/writing/watching | `ipc/files.ts`, `services/files/` | Local and remote modes both matter |
| Remote connection logic | `services/remote/`, `ipc/remote.ts` | Large, stateful subsystem |
| Claude-related integration | `services/claude/`, `ipc/claude*.ts` | Keep bridge/provider/prompts/plugins separated |
| Logging and diagnostics | `ipc/log.ts`, `utils/logger.ts`, service-specific logging | Prefer consistent logging patterns |
| Tests | `src/main/**/__tests__/**/*.test.ts` | Use Vitest for focused coverage |

## SECURITY AND ROBUSTNESS RULES

- Validate and normalize paths before using them in privileged operations.
- Keep allowlists or ownership tracking when granting file-system access.
- Return explicit, serializable errors where feasible.
- Avoid hidden global state unless the subsystem is intentionally singleton-based and documented.
- Be careful with external command execution, child-process lifetime, and shell selection.

## ANTI-PATTERNS

- Registering a new IPC handler but forgetting `ipc/index.ts`
- Putting domain logic directly inside `index.ts`
- Expanding positional IPC arguments until call sites become ambiguous
- Forgetting cleanup for watchers, PTYs, sessions, temp files, or remote subscriptions
- Assuming main-process code is safe because it is not renderer-exposed
- Mixing multiple subsystem concerns into a single large service without clear boundaries

## VERIFICATION

Use these commands after meaningful main-process changes:

```bash
pnpm typecheck
pnpm lint
pnpm test
```

Add focused tests under `src/main/**/__tests__/` when touching pure or service-level logic that can be covered with Vitest.
