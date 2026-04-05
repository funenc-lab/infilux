import jschardet from 'jschardet';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  detectEncoding,
  getRemoteWatcherKey,
  getWatcherKey,
  normalizeEncoding,
  normalizeRemoteWatchPath,
  normalizeWatchedPath,
  resolveBatchConflictTargetPath,
} from '../fileUtils';

const originalPlatformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform');

describe('fileUtils', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    if (originalPlatformDescriptor) {
      Object.defineProperty(process, 'platform', originalPlatformDescriptor);
    }
  });

  it('normalizes known encoding aliases and preserves unknown encodings', () => {
    expect(normalizeEncoding('UTF_8')).toBe('utf-8');
    expect(normalizeEncoding('windows-1252')).toBe('windows-1252');
    expect(normalizeEncoding('custom-encoding')).toBe('custom-encoding');
  });

  it('detects BOM-based encodings deterministically', () => {
    expect(detectEncoding(Buffer.from([0xef, 0xbb, 0xbf, 0x61]))).toEqual({
      encoding: 'utf-8',
      confidence: 1,
    });
    expect(detectEncoding(Buffer.from([0xff, 0xfe, 0x61, 0x00]))).toEqual({
      encoding: 'utf-16le',
      confidence: 1,
    });
    expect(detectEncoding(Buffer.from([0xfe, 0xff, 0x00, 0x61]))).toEqual({
      encoding: 'utf-16be',
      confidence: 1,
    });
  });

  it('normalizes detector results and falls back to utf-8 when detection is unavailable', () => {
    vi.spyOn(jschardet, 'detect')
      .mockReturnValueOnce({ encoding: 'Shift_JIS', confidence: 0.92 })
      .mockReturnValueOnce({ encoding: '', confidence: 0 });

    expect(detectEncoding(Buffer.from('plain text'))).toEqual({
      encoding: 'shift_jis',
      confidence: 0.92,
    });
    expect(detectEncoding(Buffer.from('fallback'))).toEqual({
      encoding: 'utf-8',
      confidence: 0,
    });
  });

  it('validates conflict target paths and trims rename candidates', () => {
    expect(resolveBatchConflictTargetPath('/tmp/target', 'fallback.txt', ' renamed.txt ')).toBe(
      '/tmp/target/renamed.txt'
    );
    expect(() =>
      resolveBatchConflictTargetPath('/tmp/target', 'fallback.txt', '../escape')
    ).toThrow('Invalid conflict rename target');
    expect(() =>
      resolveBatchConflictTargetPath('/tmp/target', 'fallback.txt', 'nested/name')
    ).toThrow('Invalid conflict rename target');
  });

  it('normalizes local and remote watcher paths consistently', () => {
    expect(normalizeRemoteWatchPath('/workspace/project///')).toBe('/workspace/project');
    expect(normalizeRemoteWatchPath('/')).toBe('/');

    const normalizedLocal = normalizeWatchedPath('C:\\Repo\\File.ts');
    expect(normalizedLocal.includes('\\')).toBe(false);

    const watcherKey = getWatcherKey(7, 'C:\\Repo\\File.ts');
    expect(watcherKey.startsWith('7:')).toBe(true);
    expect(watcherKey.endsWith(normalizedLocal)).toBe(true);

    expect(getRemoteWatcherKey(9, '/workspace/project///')).toBe('9:/workspace/project');
  });

  it('preserves watcher path casing on platforms that are not case-insensitive', () => {
    if (!originalPlatformDescriptor) {
      throw new Error('Missing process.platform descriptor');
    }

    Object.defineProperty(process, 'platform', {
      configurable: true,
      value: 'linux',
    });

    expect(normalizeWatchedPath('C:\\Repo\\File.ts')).toBe('C:/Repo/File.ts');
    expect(getWatcherKey(3, 'C:\\Repo\\File.ts')).toBe('3:C:/Repo/File.ts');
  });
});
