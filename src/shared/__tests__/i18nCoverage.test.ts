import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';

const { readdirSync, readFileSync } = await vi.importActual<typeof import('node:fs')>('node:fs');

const repoRoot = resolve(fileURLToPath(new URL('../../..', import.meta.url)));

function collectTranslationKeyFiles(): string[] {
  const roots = ['src/main', 'src/renderer'] as const;
  const files: string[] = [];

  for (const root of roots) {
    const directory = resolve(repoRoot, root);
    for (const extension of ['ts', 'tsx']) {
      const pattern = new RegExp(`\\.${extension}$`);
      for (const filePath of walkFiles(directory)) {
        if (!pattern.test(filePath)) continue;
        if (filePath.includes('/__tests__/')) continue;
        files.push(filePath.replace(`${repoRoot}/`, ''));
      }
    }
  }

  return files.sort();
}

function walkFiles(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(absolutePath));
      continue;
    }
    files.push(absolutePath);
  }
  return files;
}

const rawLiteralBlacklist: Record<string, string[]> = {
  'src/renderer/components/settings/logDiagnosticsModel.ts': [
    "output: 'Loading log diagnostics...',",
    "output: 'Log diagnostics unavailable',",
    "output: 'No recent log entries',",
  ],
  'src/renderer/index.html': [
    '>Starting Infilux<',
    'Loading workspace state, renderer modules, and development tools.',
    '>Preparing desktop workspace...<',
  ],
};

function readRepoFile(relativePath: string): string {
  return readFileSync(resolve(repoRoot, relativePath), 'utf8');
}

function collectTranslationMapKeys(source: string): Set<string> {
  const objectSource = source.split('};', 1)[0] ?? source;
  const keys = new Set<string>();
  for (const match of objectSource.matchAll(/\n\s*'([^']+)'\s*:/g)) {
    keys.add(match[1]);
  }
  for (const match of objectSource.matchAll(/\n\s*"([^"]+)"\s*:/g)) {
    keys.add(match[1]);
  }
  for (const match of objectSource.matchAll(/\n\s*([A-Za-z][A-Za-z0-9 ]*[A-Za-z0-9])\s*:/g)) {
    keys.add(match[1]);
  }
  return keys;
}

function collectLiteralTranslationKeys(source: string): string[] {
  const patterns = [
    /\bt\(\s*'([^']+)'/g,
    /\bt\(\s*"([^"]+)"/g,
    /\btNode\(\s*'([^']+)'/g,
    /\btNode\(\s*"([^"]+)"/g,
    /translate\([^,]+,\s*'([^']+)'/g,
    /translate\([^,]+,\s*"([^"]+)"/g,
  ];

  const keys: string[] = [];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const key = match[1];
      if (!keys.includes(key)) {
        keys.push(key);
      }
    }
  }
  return keys;
}

describe('i18n coverage for current UI surfaces', () => {
  it('provides zh translations for literal translation keys in the hardened surfaces', () => {
    const translationKeys = new Set([
      ...collectTranslationMapKeys(readRepoFile('src/shared/i18n.ts')),
      ...collectTranslationMapKeys(readRepoFile('src/renderer/i18n.ts')),
    ]);
    const missing: Array<{ file: string; key: string }> = [];

    for (const relativePath of collectTranslationKeyFiles()) {
      const source = readRepoFile(relativePath);
      const keys = collectLiteralTranslationKeys(source);
      for (const key of keys) {
        if (!translationKeys.has(key)) {
          missing.push({ file: relativePath, key });
        }
      }
    }

    expect(missing).toEqual([]);
  });

  it('does not leave known raw English or mixed-language UI literals in the hardened surfaces', () => {
    const offenders: Array<{ file: string; literal: string }> = [];

    for (const [relativePath, literals] of Object.entries(rawLiteralBlacklist)) {
      const source = readRepoFile(relativePath);
      for (const literal of literals) {
        if (source.includes(literal)) {
          offenders.push({ file: relativePath, literal });
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
