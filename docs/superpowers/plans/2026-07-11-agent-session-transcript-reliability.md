# Agent Session Transcript Reliability Implementation Plan

> **For agentic workers:** Execute tasks inline with a red-green-refactor cycle. This repository is a user-owned dirty `main` worktree: preserve unrelated changes and do not create commits.

**Goal:** Preserve complete output for newly created Agent sessions while keeping live xterm rendering bounded, and guarantee that interactive Agent TUIs render their latest output without parser-side truncation.

**Architecture:** The first task removes the parser policy that suppresses alternate-screen redraws for live Agent terminals. The remaining tasks add append-only producer-owned transcript archives, expose bounded page reads through the existing session bridge, and move the transcript drawer away from replay snapshots as its source of truth.

**Tech Stack:** Electron 39, React 19, TypeScript 5.9, xterm.js, Node.js `fs/promises`, generated local-supervisor and remote-helper Node.js sources, Vitest.

## Global Constraints

- Apply only to `kind: 'agent'`; ordinary terminal retention behavior remains unchanged.
- Do not rewrite, suppress, or delay interactive TUI control sequences in the live xterm path.
- Keep replay, batching, and renderer queues bounded; archives, not renderer state, own complete history.
- Use typed payloads through `src/shared/types` -> main IPC -> preload -> renderer.
- Keep all code and code comments English-only.
- Preserve local and remote behavior, explicit lifecycle cleanup, and existing dirty worktree changes.
- Do not add dependencies, type escape hatches, or commits.

---

### Task 1: Restore Native Alternate-Screen Rendering for Agent TUIs

**Files:**
- Modify: `src/renderer/hooks/xtermAgentTranscriptPolicy.ts`
- Modify: `src/renderer/hooks/useXterm.ts`
- Modify: `src/renderer/hooks/__tests__/xtermAgentTranscriptPolicy.test.ts`
- Modify: `src/renderer/hooks/__tests__/useXterm.test.ts`

**Interfaces:**
- Replace `attachAgentTranscriptMode(terminal, kind)` with `attachAgentInputSafetyPolicy(terminal, kind)`.
- The parser may suppress mouse-tracking modes only; it must return `false` for alternate-screen modes `47`, `1047`, and `1049`.

- [x] **Step 1: Write failing policy tests**

```ts
it('keeps alternate-screen mode available to interactive agent TUIs', () => {
  expect(shouldSuppressAgentPrivateModeSwitch([1049])).toBe(false);
  expect(shouldSuppressAgentPrivateModeSwitch([1047])).toBe(false);
  expect(shouldSuppressAgentPrivateModeSwitch([47])).toBe(false);
});

it('continues to suppress agent mouse tracking without changing output parsing', () => {
  expect(shouldSuppressAgentPrivateModeSwitch([1000])).toBe(true);
  expect(shouldSuppressAgentPrivateModeSwitch([1006])).toBe(true);
});
```

- [x] **Step 2: Run the policy test and confirm RED**

Run:

```bash
pnpm exec vitest run src/renderer/hooks/__tests__/xtermAgentTranscriptPolicy.test.ts --maxWorkers=1 --minWorkers=1
```

Expected: alternate-screen expectations fail because the current policy returns `true`.

- [x] **Step 3: Implement the narrow parser policy**

```ts
export function attachAgentInputSafetyPolicy(
  terminal: Pick<Terminal, 'parser'>,
  kind: SessionKind
): { dispose: () => void } | null {
  if (kind !== 'agent') return null;

  const suppressMouseTracking = (params: readonly (number | number[])[]) =>
    shouldSuppressAgentMouseTrackingSwitch(params);

  const disposables = [
    terminal.parser.registerCsiHandler({ prefix: '?', final: 'h' }, suppressMouseTracking),
    terminal.parser.registerCsiHandler({ prefix: '?', final: 'l' }, suppressMouseTracking),
  ];

  return {
    dispose() {
      for (const disposable of disposables) disposable.dispose();
    },
  };
}
```

Update `useXterm` to install this policy. Do not preserve the old transcript-mode name or alternate-screen behavior.

- [x] **Step 4: Add an xterm alternate-buffer integration assertion**

Attach the policy to a real xterm instance, feed `CSI ?1049h` and `CSI ?1049l`, and assert that it enters and exits the alternate buffer correctly.

- [x] **Step 5: Run focused tests and confirm GREEN**

```bash
pnpm exec vitest run src/renderer/hooks/__tests__/xtermAgentTranscriptPolicy.test.ts src/renderer/hooks/__tests__/useXterm.test.ts --maxWorkers=1 --minWorkers=1
```

Expected: all selected tests pass.

### Task 2: Make Every Retained Tail Unicode-Safe

**Files:**
- Create: `src/shared/utils/utf16Tail.ts`
- Create: `src/shared/utils/__tests__/utf16Tail.test.ts`
- Modify: `src/shared/utils/agentTerminalHistoryPolicy.ts`
- Modify: `src/shared/utils/persistentAgentSession.ts`
- Modify: `src/shared/utils/__tests__/agentTerminalHistoryPolicy.test.ts`
- Modify: `src/shared/utils/__tests__/persistentAgentSession.test.ts`
- Modify: `src/main/services/session/LocalSupervisorSource.ts`
- Modify: `src/main/services/remote/RemoteHelperSource.ts`
- Modify: `src/main/services/session/__tests__/LocalSupervisorSource.test.ts`
- Modify: `src/main/services/remote/__tests__/RemoteHelperSource.test.ts`

**Interfaces:**
- Export `takeUtf16Tail(value: string, maxCodeUnits: number): string` from the shared utility.
- Use it everywhere a retained replay or snapshot currently calls `slice(-limit)`.

- [x] **Step 1: Write failing shared helper tests**

```ts
it('does not begin a bounded tail with a low surrogate', () => {
  const value = `😀${'x'.repeat(15)}`;
  expect(takeUtf16Tail(value, 16)).toBe('x'.repeat(15));
});

it('keeps a complete surrogate pair when it fits exactly', () => {
  expect(takeUtf16Tail(`x😀`, 3)).toBe('x😀');
});
```

- [x] **Step 2: Run the helper test and confirm RED**

```bash
pnpm exec vitest run src/shared/utils/__tests__/utf16Tail.test.ts --maxWorkers=1 --minWorkers=1
```

Expected: the helper does not exist.

- [x] **Step 3: Implement the pure helper and adopt it locally**

```ts
export function takeUtf16Tail(value: string, maxCodeUnits: number): string {
  if (!Number.isSafeInteger(maxCodeUnits) || maxCodeUnits <= 0) return '';
  let start = Math.max(0, value.length - maxCodeUnits);
  const startsWithLowSurrogate = value.charCodeAt(start) >= 0xdc00 && value.charCodeAt(start) <= 0xdfff;
  const previousIsHighSurrogate = value.charCodeAt(start - 1) >= 0xd800 && value.charCodeAt(start - 1) <= 0xdbff;
  if (start > 0 && startsWithLowSurrogate && previousIsHighSurrogate) {
    start += 1;
  }
  return value.slice(start);
}
```

Mirror the same boundary rule in generated supervisor and remote-helper source, which cannot import renderer or main-process code at runtime.

- [x] **Step 4: Add generated-source contract tests**

Assert each source contains a safe tail helper and reproduce an emoji boundary through its extracted generated functions.

- [x] **Step 5: Run focused tests and confirm GREEN**

```bash
pnpm exec vitest run src/shared/utils/__tests__/utf16Tail.test.ts src/shared/utils/__tests__/agentTerminalHistoryPolicy.test.ts src/shared/utils/__tests__/persistentAgentSession.test.ts src/main/services/session/__tests__/LocalSupervisorSource.test.ts src/main/services/remote/__tests__/RemoteHelperSource.test.ts --maxWorkers=1 --minWorkers=1
```

Expected: all selected tests pass.

### Task 3: Add a Local Append-Only Agent Transcript Archive

**Files:**
- Create: `src/main/services/session/SessionTranscriptArchive.ts`
- Create: `src/main/services/session/__tests__/SessionTranscriptArchive.test.ts`
- Modify: `src/main/services/session/SessionManager.ts`
- Modify: `src/main/services/session/__tests__/SessionManager.test.ts`

**Interfaces:**
- `SessionTranscriptArchive.open(sessionId): Promise<void>` creates a `0600` archive below the app shared runtime directory.
- `append(sessionId, data): void` serializes writes per session without blocking PTY dispatch.
- `flush(sessionId): Promise<void>` settles queued writes before exit.
- `readPage(request: { sessionId: string; beforeByteOffset?: number; maxBytes: number }): Promise<SessionTranscriptPage>` returns valid UTF-8 text with opaque byte cursors.
- `delete(sessionId): Promise<void>` removes the archive and its queued state.

- [x] **Step 1: Write failing archive tests**

```ts
it('serializes concurrent appends in arrival order', async () => {
  archive.append('agent-1', 'first');
  archive.append('agent-1', 'second');
  await archive.flush('agent-1');
  await expect(archive.readPage({ sessionId: 'agent-1', maxBytes: 1024 })).resolves.toMatchObject({ text: 'firstsecond' });
});

it('returns a valid UTF-8 page when the byte boundary crosses an emoji', async () => {
  archive.append('agent-1', 'a😀b');
  await archive.flush('agent-1');
  await expect(archive.readPage({ sessionId: 'agent-1', maxBytes: 3 })).resolves.toMatchObject({ text: 'b' });
});
```

- [x] **Step 2: Run archive tests and confirm RED**

```bash
pnpm exec vitest run src/main/services/session/__tests__/SessionTranscriptArchive.test.ts --maxWorkers=1 --minWorkers=1
```

Expected: archive module does not exist.

- [x] **Step 3: Implement the archive service**

Use an explicit per-session promise chain, `fs/promises`, validated UUID-like session identifiers, atomic directory creation, and diagnostics. Do not store transcript bytes in SQLite metadata or in a renderer store.

- [x] **Step 4: Archive local Agent output before live dispatch**

In `SessionManager`, allocate the archive before creating a local Agent session. In `handleLocalData`, enqueue the raw data into the archive before replay trimming and live batch delivery. Flush before `emitExit`; record a degraded transcript health state on write failure without dropping live output.

- [x] **Step 5: Add lifecycle tests and confirm GREEN**

```bash
pnpm exec vitest run src/main/services/session/__tests__/SessionTranscriptArchive.test.ts src/main/services/session/__tests__/SessionManager.test.ts --maxWorkers=1 --minWorkers=1
```

Expected: archive ordering, exit flush, and live-output ordering tests pass.

### Task 4: Archive Output in Supervisor and Remote Producers

**Files:**
- Modify: `src/main/services/session/LocalSupervisorSource.ts`
- Modify: `src/main/services/remote/RemoteHelperSource.ts`
- Modify: `src/main/services/session/LocalSupervisorRuntime.ts`
- Modify: `src/main/services/session/SessionManager.ts`
- Modify: `src/main/services/session/__tests__/LocalSupervisorSource.test.ts`
- Modify: `src/main/services/remote/__tests__/RemoteHelperSource.test.ts`
- Modify: `src/main/services/session/__tests__/SessionManager.test.ts`

**Interfaces:**
- Add generated RPC methods `session:transcript:read` and `session:transcript:delete`.
- Both helpers append raw Agent output before checking attached clients or batching transport events.
- Page response shape is identical for local supervisor and remote helper.

- [x] **Step 1: Write failing generated-source tests**

```ts
it('archives agent output with no attached remote client', () => {
  const source = getRemoteServerSource();
  expect(source).toContain('appendSessionTranscript(session, chunk);');
  expect(source).toContain("'session:transcript:read'");
});

it('keeps supervisor transcript output when its clients are disconnected', () => {
  const source = getLocalSupervisorSource();
  expect(source).toContain('appendSessionTranscript(session, data);');
});
```

- [x] **Step 2: Run helper tests and confirm RED**

```bash
pnpm exec vitest run src/main/services/session/__tests__/LocalSupervisorSource.test.ts src/main/services/remote/__tests__/RemoteHelperSource.test.ts --maxWorkers=1 --minWorkers=1
```

Expected: archive helper and RPC expectations fail.

- [x] **Step 3: Implement helper-local archive queues and RPCs**

Use the helper daemon directory, `0600` files, one append promise chain per session, and byte-bounded UTF-8-safe pages. Do not delay `session:data` while an archive append is in progress; flush writes before exit and delete only after explicit deletion.

- [x] **Step 4: Proxy page reads through SessionManager**

Route direct local sessions to `SessionTranscriptArchive`, supervisor sessions to `LocalSupervisorRuntime`, and remote sessions to `remoteConnectionManager.call`. Keep raw replay as a fast attach tail only.

- [x] **Step 5: Run focused tests and confirm GREEN**

```bash
pnpm exec vitest run src/main/services/session/__tests__/LocalSupervisorSource.test.ts src/main/services/remote/__tests__/RemoteHelperSource.test.ts src/main/services/session/__tests__/SessionManager.test.ts --maxWorkers=1 --minWorkers=1
```

Expected: generated source parses, retains disconnected output, and returns bounded pages.

### Task 5: Expose Typed Transcript Reads and Replace Snapshot-Only Drawer Data

**Files:**
- Modify: `src/shared/types/session.ts`
- Modify: `src/shared/types/ipc.ts`
- Modify: `src/main/ipc/session.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/components/chat/AgentSessionTranscriptDrawer.tsx`
- Modify: `src/renderer/components/chat/agentSessionTranscriptModel.ts`
- Modify: `src/renderer/components/chat/__tests__/AgentSessionTranscriptDrawer.test.ts`
- Modify: `src/renderer/components/chat/__tests__/agentSessionTranscriptModel.test.ts`
- Add or modify: `src/main/ipc/__tests__/session.test.ts`

**Interfaces:**

```ts
export interface SessionTranscriptPageRequest {
  sessionId: string;
  beforeByteOffset?: number;
  maxBytes?: number;
}

export interface SessionTranscriptPage {
  text: string;
  nextBeforeByteOffset?: number;
  totalBytes: number;
  health: 'complete' | 'degraded' | 'unavailable';
}
```

- [x] **Step 1: Write failing IPC and drawer tests**

```ts
it('returns the latest transcript page without returning an unbounded payload', async () => {
  await expect(window.electronAPI.session.getTranscriptPage({ sessionId: 'agent-1', maxBytes: 4096 }))
    .resolves.toMatchObject({ totalBytes: expect.any(Number), text: expect.any(String) });
});

it('loads an older page only when the user requests it', async () => {
  render(<AgentSessionTranscriptDrawer open session={session} onOpenChange={vi.fn()} />);
  await userEvent.click(screen.getByRole('button', { name: 'Load older output' }));
  expect(getTranscriptPage).toHaveBeenCalledWith(expect.objectContaining({ beforeByteOffset: expect.any(Number) }));
});
```

- [x] **Step 2: Run tests and confirm RED**

```bash
pnpm exec vitest run src/main/ipc/__tests__/session.test.ts src/renderer/components/chat/__tests__/AgentSessionTranscriptDrawer.test.ts src/renderer/components/chat/__tests__/agentSessionTranscriptModel.test.ts --maxWorkers=1 --minWorkers=1
```

Expected: bridge method and load-older control do not exist.

- [x] **Step 3: Implement the full typed contract**

Add `SESSION_GET_TRANSCRIPT_PAGE`, validate a structured request in the main handler, expose `session.getTranscriptPage`, and return only a bounded page. Never expose raw filesystem or generic IPC access to the renderer.

- [x] **Step 4: Convert the drawer to page state**

Load the latest archive page when opened, prepend older pages on demand, retain a bounded rendered-line window, show archive health, and keep the current snapshot only as a temporary loading fallback.

- [x] **Step 5: Run focused tests and confirm GREEN**

```bash
pnpm exec vitest run src/main/ipc/__tests__/session.test.ts src/renderer/components/chat/__tests__/AgentSessionTranscriptDrawer.test.ts src/renderer/components/chat/__tests__/agentSessionTranscriptModel.test.ts --maxWorkers=1 --minWorkers=1
```

Expected: typed page reads and bounded drawer rendering pass.

### Task 6: Tie Archive Deletion to Persistent Session Abandonment and Verify All Paths

> Status: persistent archive deletion is implemented and covered. Managed tmux pipe capture remains intentionally deferred: adding a second live producer without a deduplication contract could duplicate transcript data. The existing tmux recovery path archives captured output, but cannot recover data that tmux itself has already discarded while the application is offline.

**Files:**
- Modify: `src/main/services/session/PersistentAgentSessionService.ts`
- Modify: `src/main/ipc/agentSession.ts`
- Modify: `src/main/services/session/hosts/TmuxSessionHost.ts`
- Modify: `src/main/services/cli/TmuxDetector.ts`
- Modify: `src/main/services/session/__tests__/PersistentAgentSessionService.test.ts`
- Modify: `src/main/ipc/__tests__/agentSession.test.ts`
- Modify: `src/main/services/session/__tests__/TmuxSessionHost.test.ts`
- Modify: `src/main/services/cli/__tests__/TmuxDetector.test.ts`

**Interfaces:**
- `PersistentAgentSessionService.abandonSession(uiSessionId)` resolves the stored backend session ID, requests archive deletion, then deletes the persistent record.
- tmux host capture uses an idempotent managed pipe writer for newly created persistent Agent sessions.

- [ ] **Step 1: Write failing abandonment and tmux lifecycle tests**

```ts
it('deletes the transcript archive before removing a persistent agent session record', async () => {
  await service.abandonSession('ui-agent-1');
  expect(transcriptArchive.delete).toHaveBeenCalledWith('backend-agent-1');
  expect(repository.deleteSession).toHaveBeenCalledWith('ui-agent-1');
});

it('configures a managed pipe writer once for a persistent tmux agent session', async () => {
  await host.ensureTranscriptCapture(record);
  await host.ensureTranscriptCapture(record);
  expect(tmuxDetector.ensureTranscriptPipe).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run tests and confirm RED**

```bash
pnpm exec vitest run src/main/services/session/__tests__/PersistentAgentSessionService.test.ts src/main/ipc/__tests__/agentSession.test.ts src/main/services/session/__tests__/TmuxSessionHost.test.ts src/main/services/cli/__tests__/TmuxDetector.test.ts --maxWorkers=1 --minWorkers=1
```

Expected: archive cleanup and tmux capture APIs do not exist.

- [ ] **Step 3: Implement lifecycle-safe deletion and tmux capture**

Validate host session names and archive identifiers before constructing tmux commands. Make pipe setup idempotent, stop it on host teardown, and surface archive failure as degraded health rather than silent data loss.

- [ ] **Step 4: Run the cross-layer focused suite**

```bash
pnpm exec vitest run src/main/services/session/__tests__/SessionTranscriptArchive.test.ts src/main/services/session/__tests__/SessionManager.test.ts src/main/services/session/__tests__/LocalSupervisorSource.test.ts src/main/services/remote/__tests__/RemoteHelperSource.test.ts src/main/services/session/__tests__/PersistentAgentSessionService.test.ts src/main/ipc/__tests__/agentSession.test.ts src/renderer/hooks/__tests__/xtermAgentTranscriptPolicy.test.ts src/renderer/hooks/__tests__/useXterm.test.ts src/renderer/components/chat/__tests__/AgentSessionTranscriptDrawer.test.ts --maxWorkers=1 --minWorkers=1
```

Expected: all selected tests pass with no live-output truncation or archive-order regressions.

- [ ] **Step 5: Run final verification**

```bash
pnpm typecheck
pnpm lint
git diff --check
pnpm test
```

Expected: all commands exit successfully. Electron E2E performance verification requires an explicitly launched CDP-enabled development app and a sustained-output scenario.
