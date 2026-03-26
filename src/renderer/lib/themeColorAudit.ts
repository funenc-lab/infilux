import path from 'node:path';

const RAW_COLOR_PATTERN = /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b|\boklch\(/g;

const ALLOWED_RENDERER_THEME_SOURCES = new Set([
  'src/renderer/lib/appTheme.ts',
  'src/renderer/lib/ghosttyTheme.ts',
  'src/renderer/components/files/editorThemePalette.ts',
  'src/renderer/styles/globals.css',
  'src/renderer/stores/settings/defaults.ts',
  'src/renderer/App/constants.ts',
  'src/renderer/components/source-control/RepositoryList.tsx',
]);

export interface ThemeColorAuditEntry {
  path: string;
  content: string;
}

export interface ThemeColorViolation {
  path: string;
  matches: string[];
}

function normalizeFilePath(filePath: string): string {
  return filePath.split(path.sep).join('/');
}

export function isRendererThemeSource(filePath: string): boolean {
  const normalizedPath = normalizeFilePath(filePath);

  if (!normalizedPath.startsWith('src/renderer/')) {
    return true;
  }

  if (normalizedPath.includes('/__tests__/')) {
    return true;
  }

  if (normalizedPath.startsWith('src/renderer/assets/')) {
    return true;
  }

  if (normalizedPath.startsWith('src/renderer/data/')) {
    return true;
  }

  return ALLOWED_RENDERER_THEME_SOURCES.has(normalizedPath);
}

export function findRawColorTokens(content: string): string[] {
  return [...content.matchAll(RAW_COLOR_PATTERN)].map((match) => match[0]);
}

export function collectThemeColorViolations(
  entries: ThemeColorAuditEntry[]
): ThemeColorViolation[] {
  return entries.flatMap((entry) => {
    if (isRendererThemeSource(entry.path)) {
      return [];
    }

    const matches = findRawColorTokens(entry.content);
    if (matches.length === 0) {
      return [];
    }

    return [
      {
        path: normalizeFilePath(entry.path),
        matches,
      },
    ];
  });
}
