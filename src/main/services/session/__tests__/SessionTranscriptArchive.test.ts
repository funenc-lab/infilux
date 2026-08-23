import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SessionTranscriptArchive } from '../SessionTranscriptArchive';

describe('SessionTranscriptArchive', () => {
  let rootDirectory: string;
  let archive: SessionTranscriptArchive;

  beforeEach(async () => {
    rootDirectory = await mkdtemp(join(tmpdir(), 'infilux-session-transcript-'));
    archive = new SessionTranscriptArchive({ rootDirectory });
  });

  afterEach(async () => {
    await rm(rootDirectory, { force: true, recursive: true });
  });

  it('serializes concurrent appends in arrival order', async () => {
    archive.append('agent-1', 'first');
    archive.append('agent-1', 'second');
    archive.append('agent-1', 'third');

    await archive.flush('agent-1');

    await expect(archive.readPage({ sessionId: 'agent-1', maxBytes: 1024 })).resolves.toEqual({
      text: 'firstsecondthird',
      startByteOffset: 0,
      endByteOffset: 16,
      hasMore: false,
      totalBytes: 16,
      health: 'complete',
    });
  });

  it('batches pending output in memory and drains it before an explicit flush', async () => {
    archive.append('agent-1', 'first');
    archive.append('agent-1', 'second');

    expect(archive.getDiagnostics('agent-1')).toEqual({
      retainedBytes: 0,
      segmentCount: 0,
      pendingAppendBytes: 11,
    });

    await archive.flush('agent-1');

    expect(archive.getDiagnostics('agent-1')).toEqual({
      retainedBytes: 11,
      segmentCount: 1,
      pendingAppendBytes: 0,
    });
    await expect(archive.readPage({ sessionId: 'agent-1', maxBytes: 1024 })).resolves.toMatchObject(
      {
        text: 'firstsecond',
        totalBytes: 11,
      }
    );
  });

  it('retains only the newest transcript bytes when the archive reaches its capacity', async () => {
    const boundedArchive = new SessionTranscriptArchive({
      rootDirectory,
      maxBytes: 16,
    });

    boundedArchive.append('agent-1', 'start-');
    boundedArchive.append('agent-1', 'middle-');
    boundedArchive.append('agent-1', 'end-123456');
    await boundedArchive.flush('agent-1');

    await expect(
      boundedArchive.readPage({ sessionId: 'agent-1', maxBytes: 1024 })
    ).resolves.toEqual({
      text: 'iddle-end-123456',
      startByteOffset: 0,
      endByteOffset: 16,
      hasMore: false,
      totalBytes: 16,
      health: 'complete',
    });
  });

  it('rebuilds a V2 archive from segments when its manifest is missing', async () => {
    const segmentDirectory = join(rootDirectory, 'v2', 'agent-1', 'segments');
    await mkdir(segmentDirectory, { recursive: true });
    await writeFile(join(segmentDirectory, '00000000000000000000.log'), 'first-');
    await writeFile(join(segmentDirectory, '00000000000000000001.log'), 'second');

    await expect(archive.readPage({ sessionId: 'agent-1', maxBytes: 1024 })).resolves.toEqual({
      text: 'first-second',
      startByteOffset: 0,
      endByteOffset: 12,
      hasMore: false,
      totalBytes: 12,
      health: 'complete',
    });
  });

  it('migrates readable legacy V1 output into V2 segments on open', async () => {
    await writeFile(join(rootDirectory, 'agent-1.log'), 'legacy output');

    await archive.open('agent-1');

    await expect(archive.readPage({ sessionId: 'agent-1', maxBytes: 1024 })).resolves.toEqual({
      text: 'legacy output',
      startByteOffset: 0,
      endByteOffset: 13,
      hasMore: false,
      totalBytes: 13,
      health: 'complete',
    });
  });

  it('reports bounded V2 segment retention after rotating archived output', async () => {
    const boundedArchive = new SessionTranscriptArchive({
      rootDirectory,
      maxBytes: 10,
      segmentBytes: 4,
    });

    boundedArchive.append('agent-1', '0123456789');
    boundedArchive.append('agent-1', 'abcdefghij');
    await boundedArchive.flush('agent-1');

    expect(boundedArchive.getDiagnostics('agent-1')).toEqual({
      retainedBytes: 10,
      segmentCount: 3,
      pendingAppendBytes: 0,
    });
    await expect(
      boundedArchive.readPage({ sessionId: 'agent-1', maxBytes: 1024 })
    ).resolves.toMatchObject({
      text: 'abcdefghij',
      totalBytes: 10,
    });
  });

  it('retains complete UTF-8 characters when compacting a transcript', async () => {
    const boundedArchive = new SessionTranscriptArchive({
      rootDirectory,
      maxBytes: 8,
    });

    boundedArchive.append('agent-1', `ab\u{1F680}cdef`);
    await boundedArchive.flush('agent-1');

    await expect(
      boundedArchive.readPage({ sessionId: 'agent-1', maxBytes: 1024 })
    ).resolves.toEqual({
      text: `\u{1F680}cdef`,
      startByteOffset: 0,
      endByteOffset: 8,
      hasMore: false,
      totalBytes: 8,
      health: 'complete',
    });
  });

  it('returns a valid UTF-8 page when the byte boundary crosses an emoji', async () => {
    archive.append('agent-1', `a\u{1F680}b`);
    await archive.flush('agent-1');

    await expect(archive.readPage({ sessionId: 'agent-1', maxBytes: 3 })).resolves.toEqual({
      text: 'b',
      startByteOffset: 5,
      endByteOffset: 6,
      hasMore: true,
      totalBytes: 6,
      health: 'complete',
    });
  });

  it('reports the ANSI parser state at a terminal replay page boundary', async () => {
    archive.append('agent-1', 'completed\n\x1b]0;Infilux\x07prompt ready\n');
    await archive.flush('agent-1');

    await expect(
      archive.readPage({
        sessionId: 'agent-1',
        maxBytes: 18,
        terminalReplay: true,
      })
    ).resolves.toMatchObject({
      text: 'ilux\x07prompt ready\n',
      initialParserState: 'osc',
    });
  });

  it('restores persisted ANSI parser state without rebuilding archive metadata', async () => {
    archive.append('agent-1', 'completed\n\x1b]0;Infilux\x07prompt ready\n');
    await archive.flush('agent-1');
    archive = new SessionTranscriptArchive({ rootDirectory });

    await expect(
      archive.readPage({
        sessionId: 'agent-1',
        maxBytes: 18,
        terminalReplay: true,
      })
    ).resolves.toMatchObject({
      text: 'ilux\x07prompt ready\n',
      initialParserState: 'osc',
    });
  });

  it('withholds terminal replay parser state from archives created before the metadata format', async () => {
    const segmentDirectory = join(rootDirectory, 'v2', 'agent-1', 'segments');
    await mkdir(segmentDirectory, { recursive: true });
    await writeFile(
      join(segmentDirectory, '00000000000000000000.log'),
      'completed\n\x1b]0;Infilux\x07prompt ready\n'
    );

    const page = await archive.readPage({
      sessionId: 'agent-1',
      maxBytes: 18,
      terminalReplay: true,
    });

    expect(page).not.toHaveProperty('initialParserState');
  });

  it('withholds terminal replay parser state when legacy migration truncates output', async () => {
    const boundedArchive = new SessionTranscriptArchive({ rootDirectory, maxBytes: 18 });
    await writeFile(
      join(rootDirectory, 'agent-1.log'),
      'completed\n\x1b]0;Infilux\x07prompt ready\n'
    );

    await boundedArchive.open('agent-1');
    const page = await boundedArchive.readPage({
      sessionId: 'agent-1',
      maxBytes: 18,
      terminalReplay: true,
    });

    expect(page).not.toHaveProperty('initialParserState');
  });

  it('creates V2 transcript manifests with owner-only permissions', async () => {
    await archive.open('agent-1');

    const filePath = join(rootDirectory, 'v2', 'agent-1', 'manifest.json');
    const [contents, fileStats] = await Promise.all([readFile(filePath, 'utf8'), stat(filePath)]);

    expect(contents).toContain('"version":2');
    expect(fileStats.mode & 0o777).toBe(0o600);
  });

  it('rejects session identifiers that could escape the archive directory', async () => {
    await expect(archive.open('../agent-1')).rejects.toThrow(
      'Invalid session transcript identifier'
    );
    expect(() => archive.append('../agent-1', 'output')).toThrow(
      'Invalid session transcript identifier'
    );
  });
});
