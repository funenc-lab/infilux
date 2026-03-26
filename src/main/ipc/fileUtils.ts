import { relative, resolve, sep } from 'node:path';
import jschardet from 'jschardet';

/**
 * Normalize encoding name to a consistent format.
 */
export function normalizeEncoding(encoding: string): string {
  const normalized = encoding.toLowerCase().replace(/[^a-z0-9]/g, '');
  const encodingMap: Record<string, string> = {
    gb2312: 'gb2312',
    gbk: 'gbk',
    gb18030: 'gb18030',
    big5: 'big5',
    shiftjis: 'shift_jis',
    eucjp: 'euc-jp',
    euckr: 'euc-kr',
    iso88591: 'iso-8859-1',
    windows1252: 'windows-1252',
    utf8: 'utf-8',
    utf16le: 'utf-16le',
    utf16be: 'utf-16be',
    ascii: 'ascii',
  };
  return encodingMap[normalized] || encoding;
}

/**
 * Detect file encoding from a buffer.
 */
export function detectEncoding(buffer: Buffer): { encoding: string; confidence: number } {
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return { encoding: 'utf-8', confidence: 1 };
  }
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return { encoding: 'utf-16le', confidence: 1 };
  }
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    return { encoding: 'utf-16be', confidence: 1 };
  }

  const result = jschardet.detect(buffer);
  if (result?.encoding) {
    return {
      encoding: normalizeEncoding(result.encoding),
      confidence: result.confidence,
    };
  }

  return { encoding: 'utf-8', confidence: 0 };
}

export function resolveBatchConflictTargetPath(
  targetDir: string,
  fallbackName: string,
  newName?: string
): string {
  const candidate = newName?.trim() || fallbackName;
  if (!candidate || candidate === '.' || candidate === '..' || /[\\/]/.test(candidate)) {
    throw new Error('Invalid conflict rename target');
  }

  const resolvedTargetDir = resolve(targetDir);
  const resolvedTargetPath = resolve(resolvedTargetDir, candidate);
  const relativePath = relative(resolvedTargetDir, resolvedTargetPath);
  if (
    relativePath === '' ||
    relativePath === '.' ||
    relativePath.startsWith(`..${sep}`) ||
    relativePath === '..'
  ) {
    throw new Error('Conflict rename target escapes destination directory');
  }

  return resolvedTargetPath;
}

export function normalizeWatchedPath(inputPath: string): string {
  const normalizedPath = inputPath.replace(/\\/g, '/');
  if (process.platform === 'win32' || process.platform === 'darwin') {
    return normalizedPath.toLowerCase();
  }
  return normalizedPath;
}

export function normalizeRemoteWatchPath(inputPath: string): string {
  const normalizedPath = inputPath.replace(/\\/g, '/');
  if (normalizedPath === '/') {
    return '/';
  }
  return normalizedPath.replace(/\/+$/, '');
}

export function getWatcherKey(ownerId: number, dirPath: string): string {
  return `${ownerId}:${normalizeWatchedPath(dirPath)}`;
}

export function getRemoteWatcherKey(windowId: number, dirPath: string): string {
  return `${windowId}:${normalizeRemoteWatchPath(dirPath)}`;
}
