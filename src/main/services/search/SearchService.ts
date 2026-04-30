import { spawn } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { basename, join, relative } from 'node:path';
import type {
  ContentSearchMatch,
  ContentSearchParams,
  ContentSearchResult,
  FileSearchParams,
  FileSearchResult,
} from '@shared/types';
import { rgPath as originalRgPath } from '@vscode/ripgrep';
import { killProcessTree } from '../../utils/processUtils';

const MAX_FILE_RESULTS = 100;
const MAX_CONTENT_RESULTS = 500;
const SEARCH_TIMEOUT_MS = 10000;
const MAX_FILESYSTEM_FALLBACK_ENTRIES = 20000;
const FILE_LIST_CACHE_TTL_MS = 2500;

const EXCLUDE_GLOBS = [
  '!node_modules/**',
  '!dist/**',
  '!build/**',
  '!.git/**',
  '!*.lock',
  '!package-lock.json',
];

const rgPath = originalRgPath.replace(/\.asar([\\/])/, '.asar.unpacked$1');
const ripgrepCandidates = rgPath === 'rg' ? ['rg'] : [rgPath, 'rg'];
const failedRipgrepCandidates = new Set<string>();
let preferredRipgrepCandidate: string | undefined;

interface FileEntry {
  path: string;
  name: string;
  relativePath: string;
}

interface RipgrepFilesResult {
  files: FileEntry[];
  retryable: boolean;
  cacheable: boolean;
}

interface ActiveSearch {
  cancel: () => void;
}

type RegisterActiveSearch = (activeSearch: ActiveSearch) => () => void;

interface FileListResult {
  files: FileEntry[];
  cacheable: boolean;
}

interface FileListCacheEntry {
  files: FileEntry[];
  expiresAt: number;
}

interface FilesystemDirectoryEntry {
  name: string;
  isDirectory: () => boolean;
  isFile: () => boolean;
}

function fuzzyMatch(query: string, target: string): number {
  const queryLower = query.toLowerCase();
  const targetLower = target.toLowerCase();

  if (targetLower === queryLower) return 1000;

  if (targetLower.includes(queryLower)) {
    if (targetLower.startsWith(queryLower)) return 900;
    return 800 - targetLower.indexOf(queryLower);
  }

  let score = 0;
  let queryIndex = 0;
  let consecutiveBonus = 0;

  for (let i = 0; i < targetLower.length && queryIndex < queryLower.length; i++) {
    if (targetLower[i] === queryLower[queryIndex]) {
      score += 10 + consecutiveBonus;
      consecutiveBonus += 5;
      queryIndex++;
    } else {
      consecutiveBonus = 0;
    }
  }

  if (queryIndex === queryLower.length) {
    return score;
  }

  return 0;
}

function normalizeRelativePath(rootPath: string, filePath: string): string {
  return relative(rootPath, filePath).replace(/\\/g, '/');
}

function getFileListCacheKey(rootPath: string, useGitignore: boolean): string {
  return `${rootPath}\0${useGitignore ? 'gitignore' : 'all'}`;
}

function isExcludedPath(relativePath: string): boolean {
  const normalized = relativePath.replace(/\\/g, '/');
  return (
    normalized === '.git' ||
    normalized.startsWith('.git/') ||
    normalized === 'node_modules' ||
    normalized.startsWith('node_modules/') ||
    normalized === 'dist' ||
    normalized.startsWith('dist/') ||
    normalized === 'build' ||
    normalized.startsWith('build/') ||
    normalized.endsWith('.lock') ||
    normalized === 'package-lock.json'
  );
}

function getDirectoryEntries(
  rootPath: string,
  files: readonly { relativePath: string }[]
): FileSearchResult[] {
  const directories = new Map<string, FileSearchResult>();

  for (const file of files) {
    const parts = file.relativePath.split('/').filter(Boolean);
    for (let index = 1; index < parts.length; index += 1) {
      const relativePath = parts.slice(0, index).join('/');
      if (directories.has(relativePath)) {
        continue;
      }
      directories.set(relativePath, {
        kind: 'directory',
        path: join(rootPath, ...parts.slice(0, index)),
        name: parts[index - 1] ?? relativePath,
        relativePath,
        score: 0,
      });
    }
  }

  return [...directories.values()];
}

async function getAllFilesWithFilesystemFallback(rootPath: string): Promise<FileEntry[]> {
  const files: FileEntry[] = [];

  async function walk(directoryPath: string): Promise<void> {
    if (files.length >= MAX_FILESYSTEM_FALLBACK_ENTRIES) {
      return;
    }

    let entries: FilesystemDirectoryEntry[];
    try {
      entries = await readdir(directoryPath, { withFileTypes: true, encoding: 'utf8' });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (files.length >= MAX_FILESYSTEM_FALLBACK_ENTRIES) {
        return;
      }

      const fullPath = join(directoryPath, entry.name);
      const relativePath = normalizeRelativePath(rootPath, fullPath);
      if (!relativePath || isExcludedPath(relativePath)) {
        continue;
      }

      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      files.push({
        path: fullPath,
        name: entry.name,
        relativePath,
      });
    }
  }

  await walk(rootPath);
  return files;
}

async function getAllFilesWithRipgrepBinary(
  binaryPath: string,
  rootPath: string,
  useGitignore: boolean,
  registerActiveSearch?: RegisterActiveSearch
): Promise<RipgrepFilesResult> {
  return new Promise((resolve) => {
    const args = ['--files'];
    if (!useGitignore) {
      args.push('--no-ignore');
    }
    args.push(...EXCLUDE_GLOBS.flatMap((g) => ['--glob', g]), rootPath);

    const files: FileEntry[] = [];
    let buffer = '';

    const rg = spawn(binaryPath, args);
    let settled = false;
    let timeoutId: NodeJS.Timeout | undefined;
    let unregisterActiveSearch: () => void = () => undefined;

    const cleanup = () => {
      rg.stdout.removeAllListeners('data');
      rg.removeAllListeners('close');
      rg.removeAllListeners('error');
      unregisterActiveSearch();
    };

    const finish = (result: RipgrepFilesResult) => {
      if (settled) {
        return;
      }
      settled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      cleanup();
      resolve(result);
    };

    rg.stdout.on('data', (data) => {
      buffer += data.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const filePath = line.trim();
        if (!filePath) continue;

        files.push({
          path: filePath,
          name: basename(filePath),
          relativePath: normalizeRelativePath(rootPath, filePath),
        });
      }
    });

    timeoutId = setTimeout(() => {
      killProcessTree(rg);
      finish({ files, retryable: false, cacheable: false });
    }, SEARCH_TIMEOUT_MS);

    unregisterActiveSearch =
      registerActiveSearch?.({
        cancel: () => {
          killProcessTree(rg);
          finish({ files: [], retryable: false, cacheable: false });
        },
      }) ?? unregisterActiveSearch;

    rg.on('close', () => {
      preferredRipgrepCandidate = binaryPath;

      if (buffer.trim()) {
        const filePath = buffer.trim();
        files.push({
          path: filePath,
          name: basename(filePath),
          relativePath: normalizeRelativePath(rootPath, filePath),
        });
      }

      finish({ files, retryable: false, cacheable: true });
    });

    rg.on('error', (err) => {
      if (!failedRipgrepCandidates.has(binaryPath)) {
        failedRipgrepCandidates.add(binaryPath);
        console.error('[SearchService] ripgrep --files spawn error:', err.message);
      }
      finish({ files: [], retryable: true, cacheable: false });
    });
  });
}

async function getAllFiles(
  rootPath: string,
  useGitignore: boolean,
  registerActiveSearch?: RegisterActiveSearch
): Promise<FileListResult> {
  const candidates = preferredRipgrepCandidate
    ? [
        preferredRipgrepCandidate,
        ...ripgrepCandidates.filter((candidate) => candidate !== preferredRipgrepCandidate),
      ]
    : ripgrepCandidates;

  for (const candidate of candidates) {
    const result = await getAllFilesWithRipgrepBinary(
      candidate,
      rootPath,
      useGitignore,
      registerActiveSearch
    );
    if (!result.retryable) {
      return {
        files: result.files,
        cacheable: result.cacheable,
      };
    }
  }

  return {
    files: await getAllFilesWithFilesystemFallback(rootPath),
    cacheable: true,
  };
}

export class SearchService {
  private readonly activeSearches = new Map<string, ActiveSearch>();
  private readonly fileListCache = new Map<string, FileListCacheEntry>();

  cancelSearch(requestId: string): boolean {
    const activeSearch = this.activeSearches.get(requestId);
    if (!activeSearch) {
      return false;
    }
    activeSearch.cancel();
    return true;
  }

  private registerActiveSearch(
    requestId: string | undefined,
    activeSearch: ActiveSearch
  ): () => void {
    if (!requestId) {
      return () => undefined;
    }

    this.activeSearches.get(requestId)?.cancel();
    this.activeSearches.set(requestId, activeSearch);

    return () => {
      if (this.activeSearches.get(requestId) === activeSearch) {
        this.activeSearches.delete(requestId);
      }
    };
  }

  private getCachedFileList(rootPath: string, useGitignore: boolean): FileEntry[] | null {
    const cacheKey = getFileListCacheKey(rootPath, useGitignore);
    const cacheEntry = this.fileListCache.get(cacheKey);
    if (!cacheEntry) {
      return null;
    }

    if (cacheEntry.expiresAt <= Date.now()) {
      this.fileListCache.delete(cacheKey);
      return null;
    }

    return cacheEntry.files;
  }

  private setCachedFileList(rootPath: string, useGitignore: boolean, files: FileEntry[]): void {
    this.fileListCache.set(getFileListCacheKey(rootPath, useGitignore), {
      files,
      expiresAt: Date.now() + FILE_LIST_CACHE_TTL_MS,
    });
  }

  async searchFiles(params: FileSearchParams): Promise<FileSearchResult[]> {
    const {
      requestId,
      rootPath,
      query,
      maxResults = MAX_FILE_RESULTS,
      includeDirectories = false,
      useGitignore = true,
    } = params;

    let allFiles = this.getCachedFileList(rootPath, useGitignore);
    if (!allFiles) {
      const fileListResult = await getAllFiles(rootPath, useGitignore, (activeSearch) =>
        this.registerActiveSearch(requestId, activeSearch)
      );
      allFiles = fileListResult.files;
      if (fileListResult.cacheable) {
        this.setCachedFileList(rootPath, useGitignore, allFiles);
      }
    }
    const searchableEntries: FileSearchResult[] = includeDirectories
      ? [
          ...allFiles.map((file) => ({ ...file, kind: 'file' as const, score: 0 })),
          ...getDirectoryEntries(rootPath, allFiles),
        ]
      : allFiles.map((file) => ({ ...file, score: 0 }));

    if (!query.trim()) {
      return searchableEntries
        .sort((a, b) => a.relativePath.localeCompare(b.relativePath))
        .slice(0, maxResults);
    }

    const scoredResults = searchableEntries
      .map((entry) => {
        const nameScore = fuzzyMatch(query, entry.name);
        const pathScore = fuzzyMatch(query, entry.relativePath) * 0.8;
        return {
          ...entry,
          score: Math.max(nameScore, pathScore),
        };
      })
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults);

    return scoredResults;
  }

  async searchContent(params: ContentSearchParams): Promise<ContentSearchResult> {
    const {
      requestId,
      rootPath,
      query,
      maxResults = MAX_CONTENT_RESULTS,
      caseSensitive = false,
      wholeWord = false,
      regex = false,
      filePattern,
      useGitignore = true,
    } = params;

    if (!query.trim()) {
      return { matches: [], totalMatches: 0, totalFiles: 0, truncated: false };
    }

    return new Promise((resolve) => {
      const args = [
        '--json',
        '--line-number',
        '--column',
        '--max-count',
        '100',
        '--max-filesize',
        '1M',
      ];

      args.push(...EXCLUDE_GLOBS.flatMap((g) => ['--glob', g]));

      if (!useGitignore) args.push('--no-ignore');

      if (!caseSensitive) args.push('-i');
      if (wholeWord) args.push('-w');
      if (!regex) args.push('-F');
      if (filePattern) args.push('--glob', filePattern);

      args.push('--', query, rootPath);

      const matches: ContentSearchMatch[] = [];
      const fileSet = new Set<string>();
      let totalMatches = 0;
      let truncated = false;
      let stderr = '';

      const rg = spawn(rgPath, args);
      let buffer = '';
      let settled = false;
      let timeoutId: NodeJS.Timeout | undefined;
      let unregisterActiveSearch: () => void = () => undefined;

      const cleanup = () => {
        rg.stdout.removeAllListeners('data');
        rg.stderr.removeAllListeners('data');
        rg.removeAllListeners('close');
        rg.removeAllListeners('error');
        unregisterActiveSearch();
      };

      const finish = (result: ContentSearchResult) => {
        if (settled) {
          return;
        }
        settled = true;
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        cleanup();
        resolve(result);
      };

      rg.stdout.on('data', (data) => {
        buffer += data.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;

          try {
            const json = JSON.parse(line);
            if (json.type === 'match') {
              totalMatches++;
              fileSet.add(json.data.path.text);

              if (matches.length < maxResults) {
                const submatch = json.data.submatches?.[0];
                const match: ContentSearchMatch = {
                  path: json.data.path.text,
                  relativePath: relative(rootPath, json.data.path.text),
                  line: json.data.line_number,
                  column: submatch?.start || 0,
                  matchLength: submatch ? submatch.end - submatch.start : 0,
                  content: json.data.lines.text.replace(/\n$/, ''),
                };
                matches.push(match);
              } else {
                truncated = true;
              }
            }
          } catch {
            // Ignore malformed JSON lines from ripgrep.
          }
        }
      });

      rg.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      timeoutId = setTimeout(() => {
        killProcessTree(rg);
        finish({
          matches,
          totalMatches,
          totalFiles: fileSet.size,
          truncated: true,
        });
      }, SEARCH_TIMEOUT_MS);

      unregisterActiveSearch = this.registerActiveSearch(requestId, {
        cancel: () => {
          killProcessTree(rg);
          finish({
            matches: [],
            totalMatches: 0,
            totalFiles: 0,
            truncated: true,
          });
        },
      });

      rg.on('close', (code) => {
        if (buffer.trim()) {
          try {
            const json = JSON.parse(buffer);
            if (json.type === 'match') {
              totalMatches++;
              fileSet.add(json.data.path.text);
              if (matches.length < maxResults) {
                const submatch = json.data.submatches?.[0];
                const match: ContentSearchMatch = {
                  path: json.data.path.text,
                  relativePath: relative(rootPath, json.data.path.text),
                  line: json.data.line_number,
                  column: submatch?.start || 0,
                  matchLength: submatch ? submatch.end - submatch.start : 0,
                  content: json.data.lines.text.replace(/\n$/, ''),
                };
                matches.push(match);
              }
            }
          } catch {
            // ignore
          }
        }

        const error =
          code === 2 && stderr && totalMatches === 0 ? 'Invalid search expression' : undefined;

        if (code === 2 && stderr) {
          console.error('[SearchService] ripgrep error:', stderr);
        }

        finish({
          matches,
          totalMatches,
          totalFiles: fileSet.size,
          truncated,
          ...(error ? { error } : {}),
        });
      });

      rg.on('error', (err) => {
        console.error('[SearchService] ripgrep spawn error:', err.message);
        finish({
          matches: [],
          totalMatches: 0,
          totalFiles: 0,
          truncated: false,
        });
      });
    });
  }
}

export const searchService = new SearchService();
