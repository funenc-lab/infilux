import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { collectThemeColorViolations } from '../src/renderer/lib/themeColorAudit';

const RENDERER_SOURCE_DIRECTORY = path.join('src', 'renderer');
const RENDERER_FILE_EXTENSIONS = new Set(['.ts', '.tsx', '.css']);

export function collectRendererFilePaths(projectRoot: string): string[] {
  const rendererRoot = path.join(projectRoot, RENDERER_SOURCE_DIRECTORY);
  const rendererFiles: string[] = [];

  walkRendererDirectory(rendererRoot, projectRoot, rendererFiles);

  return rendererFiles.sort((left, right) => left.localeCompare(right));
}

function walkRendererDirectory(
  currentDirectory: string,
  projectRoot: string,
  rendererFiles: string[]
): void {
  const directoryEntries = readdirSync(currentDirectory, { withFileTypes: true });

  for (const entry of directoryEntries) {
    const entryPath = path.join(currentDirectory, entry.name);

    if (entry.isDirectory()) {
      walkRendererDirectory(entryPath, projectRoot, rendererFiles);
      continue;
    }

    if (!entry.isFile() || !RENDERER_FILE_EXTENSIONS.has(path.extname(entry.name))) {
      continue;
    }

    rendererFiles.push(path.relative(projectRoot, entryPath));
  }
}

export function runRendererThemeColorAudit(projectRoot: string): number {
  const rendererFiles = collectRendererFilePaths(projectRoot);
  const entries = rendererFiles.map((relativePath) => ({
    path: relativePath,
    content: readFileSync(path.join(projectRoot, relativePath), 'utf8'),
  }));

  const violations = collectThemeColorViolations(entries);

  if (violations.length === 0) {
    process.stdout.write('Renderer theme color audit passed.\n');
    return 0;
  }

  process.stderr.write('Renderer theme color audit failed.\n');

  for (const violation of violations) {
    const uniqueMatches = [...new Set(violation.matches)];
    process.stderr.write(`- ${violation.path}: ${uniqueMatches.join(', ')}\n`);
  }

  return 1;
}

function isDirectExecution(): boolean {
  const entryFile = process.argv[1];

  if (!entryFile) {
    return false;
  }

  return import.meta.url === pathToFileURL(entryFile).href;
}

if (isDirectExecution()) {
  process.exit(runRendererThemeColorAudit(process.cwd()));
}
