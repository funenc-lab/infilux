import * as fsp from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getSessionTranscriptArchiveRuntimeSource } from '../SessionTranscriptArchiveSource';

type GeneratedTranscriptPage = {
  text: string;
  startByteOffset: number;
  endByteOffset: number;
  hasMore: boolean;
  totalBytes: number;
  health: 'complete' | 'degraded' | 'unavailable';
  initialParserState?: string;
};

type GeneratedTranscriptRuntime = {
  appendSessionTranscript: (session: { sessionId: string; kind: string }, chunk: string) => void;
  flushSessionTranscript: (session: { sessionId: string; kind: string }) => Promise<boolean>;
  openSessionTranscript: (session: { sessionId: string; kind: string }) => Promise<boolean>;
  readSessionTranscriptPage: (params: {
    sessionId: string;
    beforeByteOffset?: number;
    maxBytes: number;
    terminalReplay?: boolean;
  }) => Promise<GeneratedTranscriptPage>;
};

function createGeneratedTranscriptRuntime(rootDirectory: string): GeneratedTranscriptRuntime {
  const factory = new Function(
    'fsp',
    'path',
    'rootDirectory',
    `
      function getSessionTranscriptRootDirectory() {
        return rootDirectory;
      }
      ${getSessionTranscriptArchiveRuntimeSource()}
      return {
        appendSessionTranscript,
        flushSessionTranscript,
        openSessionTranscript,
        readSessionTranscriptPage,
      };
    `
  ) as (
    fileSystem: typeof fsp,
    pathModule: typeof path,
    root: string
  ) => GeneratedTranscriptRuntime;

  return factory(fsp, path, rootDirectory);
}

describe('getSessionTranscriptArchiveRuntimeSource', () => {
  let rootDirectory: string;

  beforeEach(async () => {
    rootDirectory = await fsp.mkdtemp(path.join(tmpdir(), 'infilux-generated-transcript-'));
  });

  afterEach(async () => {
    await fsp.rm(rootDirectory, { force: true, recursive: true });
  });

  it('serializes generated archive appends and keeps UTF-8 pages valid', async () => {
    const runtime = createGeneratedTranscriptRuntime(rootDirectory);
    const session = { sessionId: 'agent-1', kind: 'agent' };

    await runtime.openSessionTranscript(session);
    runtime.appendSessionTranscript(session, 'first');
    runtime.appendSessionTranscript(session, `a\u{1F680}b`);
    await runtime.flushSessionTranscript(session);

    await expect(
      runtime.readSessionTranscriptPage({ sessionId: 'agent-1', maxBytes: 3 })
    ).resolves.toEqual({
      text: 'b',
      startByteOffset: 10,
      endByteOffset: 11,
      hasMore: true,
      totalBytes: 11,
      health: 'complete',
    });
  });

  it('keeps generated archive output in a bounded pending batch before flushing', () => {
    const source = getSessionTranscriptArchiveRuntimeSource();

    expect(source).toContain('const sessionTranscriptPendingAppends = new Map();');
    expect(source).toContain('function queueSessionTranscriptAppend(sessionId, chunk) {');
    expect(source).toContain('await flushPendingSessionTranscriptAppend(normalizedSessionId);');
  });

  it('reports the ANSI parser state at a generated terminal replay page boundary', async () => {
    const runtime = createGeneratedTranscriptRuntime(rootDirectory);
    const session = { sessionId: 'agent-1', kind: 'agent' };

    await runtime.openSessionTranscript(session);
    runtime.appendSessionTranscript(session, 'completed\n\x1b]0;Infilux\x07prompt ready\n');
    await runtime.flushSessionTranscript(session);

    await expect(
      runtime.readSessionTranscriptPage({
        sessionId: 'agent-1',
        maxBytes: 18,
        terminalReplay: true,
      })
    ).resolves.toMatchObject({
      text: 'ilux\x07prompt ready\n',
      initialParserState: 'osc',
    });
  });

  it('restores generated ANSI parser state from persisted archive metadata', async () => {
    const session = { sessionId: 'agent-1', kind: 'agent' };
    const writer = createGeneratedTranscriptRuntime(rootDirectory);

    await writer.openSessionTranscript(session);
    writer.appendSessionTranscript(session, 'completed\n\x1b]0;Infilux\x07prompt ready\n');
    await writer.flushSessionTranscript(session);

    const reader = createGeneratedTranscriptRuntime(rootDirectory);
    await expect(
      reader.readSessionTranscriptPage({
        sessionId: 'agent-1',
        maxBytes: 18,
        terminalReplay: true,
      })
    ).resolves.toMatchObject({
      text: 'ilux\x07prompt ready\n',
      initialParserState: 'osc',
    });
  });

  it('rebuilds generated V2 archive pages when the manifest is missing', async () => {
    const runtime = createGeneratedTranscriptRuntime(rootDirectory);
    const segmentDirectory = path.join(
      rootDirectory,
      'session-transcripts',
      'v2',
      'agent-1',
      'segments'
    );
    await fsp.mkdir(segmentDirectory, { recursive: true });
    await fsp.writeFile(path.join(segmentDirectory, '00000000000000000000.log'), 'first-');
    await fsp.writeFile(path.join(segmentDirectory, '00000000000000000001.log'), 'second');

    await expect(
      runtime.readSessionTranscriptPage({ sessionId: 'agent-1', maxBytes: 1024 })
    ).resolves.toEqual({
      text: 'first-second',
      startByteOffset: 0,
      endByteOffset: 12,
      hasMore: false,
      totalBytes: 12,
      health: 'complete',
    });
  });

  it('migrates generated legacy V1 output into V2 segments on open', async () => {
    const runtime = createGeneratedTranscriptRuntime(rootDirectory);
    await fsp.mkdir(path.join(rootDirectory, 'session-transcripts'), { recursive: true });
    await fsp.writeFile(path.join(rootDirectory, 'session-transcripts', 'agent-1.log'), 'legacy');

    await expect(
      runtime.openSessionTranscript({ sessionId: 'agent-1', kind: 'agent' })
    ).resolves.toBe(true);
    await expect(
      runtime.readSessionTranscriptPage({ sessionId: 'agent-1', maxBytes: 1024 })
    ).resolves.toMatchObject({
      text: 'legacy',
      totalBytes: 6,
      health: 'complete',
    });
  });
});
