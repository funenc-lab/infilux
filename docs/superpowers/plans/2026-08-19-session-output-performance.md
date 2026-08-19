# Session Output Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline execution authorized by the user). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make high-volume terminal and agent output bounded in disk, memory, and renderer work without losing recoverable transcript data.

**Architecture:** Replace full-file transcript compaction with a versioned segmented archive that preserves the existing read-page contract. Add bounded main-process output queues and renderer resync behavior so inactive or overloaded terminal views recover from the archive instead of accumulating unbounded live output.

**Tech Stack:** Electron 39, TypeScript 5.9, Node filesystem promises, React 19, xterm.js, Vitest.

## Global Constraints

- Keep `SessionManager` responsible for session lifecycle and `terminal/` responsible for PTY transport.
- Preserve existing V1 transcript reading and never delete legacy `pty-*.log` files automatically.
- Keep the default retained transcript size at 32 MiB and the maximum read page at 256 KiB.
- Use `pnpm` and add a matching regression test for every production behavior change.
- All production source and source comments are English.

## Test Plan

| Code Change | File/Function | Test Change | Test File |
| --- | --- | --- | --- |
| V2 segmented retention | `SessionTranscriptArchive` | ordering, UTF-8, cap, recovery, V1 fallback | `SessionTranscriptArchive.test.ts` |
| Supervisor runtime parity | `SessionTranscriptArchiveSource` | generated runtime rotation and page reads | `SessionTranscriptArchiveSource.test.ts` |
| Bounded output queue | `SessionOutputBatcher` | high-water resync and byte cap | `SessionOutputBatcher.test.ts` |
| Renderer resync | `useXterm` | hidden view pauses writes and activation backfills | `useXterm.test.ts` |

### Task 1: Transcript archive V2

**Files:**
- Modify: `src/main/services/session/SessionTranscriptArchive.ts`
- Modify: `src/main/services/session/SessionTranscriptArchiveSource.ts`
- Test: `src/main/services/session/__tests__/SessionTranscriptArchive.test.ts`
- Test: `src/main/services/session/__tests__/SessionTranscriptArchiveSource.test.ts`

**Interfaces:**
- Consumes: `SessionTranscriptArchivePageRequest` and `SessionTranscriptArchivePage`.
- Produces: the same `open`, `append`, `flush`, `readPage`, and `delete` archive contract.

- [ ] **Step 1: Write failing V2 retention tests**

```ts
archive.append('agent-1', '0123456789');
archive.append('agent-1', 'abcdefghij');
await archive.flush('agent-1');
await expect(archive.readPage({ sessionId: 'agent-1', maxBytes: 10 })).resolves.toMatchObject({
  text: 'abcdefghij',
  totalBytes: 10,
});
```

- [ ] **Step 2: Verify the tests fail on the V1-only archive**

Run: `pnpm vitest run src/main/services/session/__tests__/SessionTranscriptArchive.test.ts`

- [ ] **Step 3: Implement segmented append, atomic manifest recovery, V1 fallback, and delete cleanup**

```ts
type TranscriptManifest = {
  version: 2;
  segmentIds: number[];
  retainedBytes: number;
};
```

- [ ] **Step 4: Verify archive and generated-runtime tests pass**

Run: `pnpm vitest run src/main/services/session/__tests__/SessionTranscriptArchive.test.ts src/main/services/session/__tests__/SessionTranscriptArchiveSource.test.ts`

### Task 2: Main-process output backpressure

**Files:**
- Modify: `src/main/services/session/SessionOutputBatcher.ts`
- Modify: `src/main/services/session/SessionManager.ts`
- Test: `src/main/services/session/__tests__/SessionOutputBatcher.test.ts`
- Test: `src/main/services/session/__tests__/SessionManager.test.ts`

**Interfaces:**
- Consumes: session output chunks and attached window ids.
- Produces: bounded `session:data` deliveries plus `session:resync` events for overloaded views.

- [ ] **Step 1: Write failing high-water tests**

```ts
batcher.enqueue(1, 'session-1', 'a'.repeat(highWaterMark + 1));
expect(deliveries).toEqual([{ type: 'resync', sessionId: 'session-1' }]);
expect(batcher.getDiagnostics().pendingCharCount).toBeLessThanOrEqual(highWaterMark);
```

- [ ] **Step 2: Verify the tests fail because the current batcher forwards unlimited chunks**

Run: `pnpm vitest run src/main/services/session/__tests__/SessionOutputBatcher.test.ts`

- [ ] **Step 3: Implement per-window/session byte caps, high-water resync, and cleanup on detach/window destruction**

```ts
type Delivery =
  | { type: 'data'; sessionId: string; data: string }
  | { type: 'resync'; sessionId: string };
```

- [ ] **Step 4: Verify targeted main-process tests pass**

Run: `pnpm vitest run src/main/services/session/__tests__/SessionOutputBatcher.test.ts src/main/services/session/__tests__/SessionManager.test.ts`

### Task 3: Renderer pause and archive-backed resync

**Files:**
- Modify: `src/shared/types/session.ts`
- Modify: `src/shared/types/ipc.ts`
- Modify: `src/preload/sessionEventRouter.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/hooks/useXterm.ts`
- Test: `src/preload/__tests__/sessionEventRouter.test.ts`
- Test: `src/renderer/hooks/__tests__/useXterm.test.ts`

**Interfaces:**
- Consumes: `session:resync` events and visibility state.
- Produces: no live xterm writes while hidden, followed by a transcript page reload before visible live output resumes.

- [ ] **Step 1: Write failing event routing and hidden-view tests**

```ts
emitResync({ sessionId: 'session-1' });
setVisible(false);
emitData({ sessionId: 'session-1', data: 'background output' });
expect(terminal.write).not.toHaveBeenCalled();
setVisible(true);
await expect(getTranscriptPage).toHaveBeenCalledWith({ sessionId: 'session-1', maxBytes: 64 * 1024 });
```

- [ ] **Step 2: Verify the tests fail because session data is currently delivered directly**

Run: `pnpm vitest run src/preload/__tests__/sessionEventRouter.test.ts src/renderer/hooks/__tests__/useXterm.test.ts`

- [ ] **Step 3: Add typed resync routing and animation-frame-bounded terminal draining**

```ts
export interface SessionResyncEvent {
  sessionId: string;
}
```

- [ ] **Step 4: Verify targeted preload and renderer tests pass**

Run: `pnpm vitest run src/preload/__tests__/sessionEventRouter.test.ts src/renderer/hooks/__tests__/useXterm.test.ts`

### Task 4: Diagnostics and release verification

**Files:**
- Modify: `src/main/services/session/SessionTranscriptArchive.ts`
- Modify: `src/main/services/session/SessionOutputBatcher.ts`
- Modify: `scripts/collect-diagnostics.ts`
- Test: `src/main/services/session/__tests__/SessionTranscriptArchive.test.ts`
- Test: `src/main/services/session/__tests__/SessionOutputBatcher.test.ts`

**Interfaces:**
- Consumes: archive and output-batcher diagnostic snapshots.
- Produces: diagnostics bundle fields for retained bytes, queued bytes, segment rotations, and resync count.

- [ ] **Step 1: Write failing diagnostics shape tests**

```ts
expect(archive.getDiagnostics()).toMatchObject({ retainedBytes: 10, segmentCount: 1 });
expect(batcher.getDiagnostics()).toMatchObject({ resyncCount: 1 });
```

- [ ] **Step 2: Implement serializable counters without logging session contents**

```ts
type TranscriptArchiveDiagnostics = {
  retainedBytes: number;
  segmentCount: number;
  pendingAppendBytes: number;
};
```

- [ ] **Step 3: Run full quality gates and the diagnostics collector**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm diagnostics:collect -- --output-dir .tmp/diagnostics/session-output-release`

## Self-Review

- The plan preserves transcript compatibility, retention limits, session lifecycle ownership, and renderer IPC typing.
- All production changes map to named test files and explicit observable behaviors.
- Legacy transcript cleanup remains an explicit future user action rather than an upgrade side effect.
