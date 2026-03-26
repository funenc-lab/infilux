import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type SpawnedGitProcess = EventEmitter & {
  stdout: EventEmitter;
};

const encodingTestDoubles = vi.hoisted(() => {
  const detect = vi.fn();
  const decode = vi.fn(
    (buffer: Buffer, encoding: string) => `${encoding}:${buffer.toString('utf-8')}`
  );
  const isBinaryFile = vi.fn();
  const spawned: SpawnedGitProcess[] = [];
  const spawnGit = vi.fn(() => {
    const stdout = new EventEmitter();
    const proc = new EventEmitter() as SpawnedGitProcess;
    proc.stdout = stdout;
    spawned.push(proc);
    return proc;
  });

  function reset() {
    detect.mockReset();
    decode.mockReset();
    isBinaryFile.mockReset();
    spawnGit.mockClear();
    spawned.length = 0;

    detect.mockReturnValue({ encoding: 'utf-8' });
    decode.mockImplementation(
      (buffer: Buffer, encoding: string) => `${encoding}:${buffer.toString('utf-8')}`
    );
    isBinaryFile.mockResolvedValue(false);
  }

  return {
    detect,
    decode,
    isBinaryFile,
    spawned,
    spawnGit,
    reset,
  };
});

vi.mock('jschardet', () => ({
  default: {
    detect: encodingTestDoubles.detect,
  },
}));

vi.mock('iconv-lite', () => ({
  default: {
    decode: encodingTestDoubles.decode,
  },
}));

vi.mock('isbinaryfile', () => ({
  isBinaryFile: encodingTestDoubles.isBinaryFile,
}));

vi.mock('../runtime', () => ({
  spawnGit: encodingTestDoubles.spawnGit,
}));

describe('git encoding helpers', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    encodingTestDoubles.reset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('decodes buffers using detected encodings and handles empty input', async () => {
    const { decodeBuffer } = await import('../encoding');

    expect(decodeBuffer(Buffer.alloc(0))).toBe('');

    encodingTestDoubles.detect.mockReturnValueOnce({ encoding: 'gbk' });
    expect(decodeBuffer(Buffer.from('hello'))).toBe('gbk:hello');
    expect(encodingTestDoubles.decode).toHaveBeenCalledWith(Buffer.from('hello'), 'gbk');
  });

  it('detects binary files from disk and falls back to git content on ENOENT', async () => {
    const enoent = Object.assign(new Error('missing'), { code: 'ENOENT' });
    encodingTestDoubles.isBinaryFile
      .mockResolvedValueOnce(true)
      .mockRejectedValueOnce(enoent)
      .mockResolvedValueOnce(true);

    const { detectBinaryFile } = await import('../encoding');

    await expect(detectBinaryFile('/repo/direct.bin', '/repo', 'HEAD:file')).resolves.toBe(true);

    const fallbackPromise = detectBinaryFile('/repo/deleted.bin', '/repo', 'HEAD:file');
    await Promise.resolve();
    const proc = encodingTestDoubles.spawned[0];
    if (!proc) {
      throw new Error('Missing spawned git process');
    }
    proc.stdout.emit('data', Buffer.from('git-bytes'));
    proc.emit('close', 0);

    await expect(fallbackPromise).resolves.toBe(true);
    expect(encodingTestDoubles.isBinaryFile).toHaveBeenLastCalledWith(
      Buffer.from('git-bytes'),
      Buffer.from('git-bytes').length
    );
  });

  it('returns false when binary detection or git show fails', async () => {
    const unexpected = Object.assign(new Error('boom'), { code: 'EACCES' });
    encodingTestDoubles.isBinaryFile.mockRejectedValueOnce(unexpected);

    const { detectBinaryFile, gitShow, gitShowBuffer } = await import('../encoding');

    await expect(detectBinaryFile('/repo/file.txt', '/repo', 'HEAD:file')).resolves.toBe(false);

    const emptyBufferPromise = gitShowBuffer('/repo', 'HEAD:file');
    const procWithNoChunks = encodingTestDoubles.spawned[0];
    if (!procWithNoChunks) {
      throw new Error('Missing spawned git process');
    }
    procWithNoChunks.emit('close', 1);
    await expect(emptyBufferPromise).resolves.toEqual(Buffer.alloc(0));

    const erroredBufferPromise = gitShowBuffer('/repo', 'HEAD:file');
    const erroredProc = encodingTestDoubles.spawned[1];
    if (!erroredProc) {
      throw new Error('Missing errored git process');
    }
    erroredProc.emit('error', new Error('spawn failed'));
    await expect(erroredBufferPromise).resolves.toEqual(Buffer.alloc(0));

    const decodedPromise = gitShow('/repo', 'HEAD:file');
    const decodedProc = encodingTestDoubles.spawned[2];
    if (!decodedProc) {
      throw new Error('Missing decoded git process');
    }
    decodedProc.stdout.emit('data', Buffer.from('plain text'));
    decodedProc.emit('close', 0);

    await expect(decodedPromise).resolves.toBe('utf-8:plain text');
  });
});
