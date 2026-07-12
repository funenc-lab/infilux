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
};

type GeneratedTranscriptRuntime = {
  appendSessionTranscript: (session: { sessionId: string; kind: string }, chunk: string) => void;
  flushSessionTranscript: (session: { sessionId: string; kind: string }) => Promise<boolean>;
  openSessionTranscript: (session: { sessionId: string; kind: string }) => Promise<boolean>;
  readSessionTranscriptPage: (params: {
    sessionId: string;
    beforeByteOffset?: number;
    maxBytes: number;
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
});
