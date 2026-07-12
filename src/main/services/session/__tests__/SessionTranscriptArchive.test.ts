import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
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

  it('creates transcript files with owner-only permissions', async () => {
    await archive.open('agent-1');

    const filePath = join(rootDirectory, 'agent-1.log');
    const [contents, fileStats] = await Promise.all([readFile(filePath, 'utf8'), stat(filePath)]);

    expect(contents).toBe('');
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
