import { describe, expect, it } from 'vitest';
import {
  detectEncoding,
  getRemoteWatcherKey,
  getWatcherKey,
  normalizeEncoding,
  normalizeRemoteWatchPath,
  normalizeWatchedPath,
  resolveBatchConflictTargetPath,
} from '../fileUtils';

describe('fileUtils', () => {
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
});
