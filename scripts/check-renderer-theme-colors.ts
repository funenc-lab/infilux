import { globSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { collectThemeColorViolations } from '../src/renderer/lib/themeColorAudit';

const projectRoot = process.cwd();
const rendererFiles = globSync('src/renderer/**/*.{ts,tsx,css}', {
  cwd: projectRoot,
  nodir: true,
});

const entries = rendererFiles.map((relativePath) => ({
  path: relativePath,
  content: readFileSync(path.join(projectRoot, relativePath), 'utf8'),
}));

const violations = collectThemeColorViolations(entries);

if (violations.length === 0) {
  process.stdout.write('Renderer theme color audit passed.\n');
  process.exit(0);
}

process.stderr.write('Renderer theme color audit failed.\n');

for (const violation of violations) {
  const uniqueMatches = [...new Set(violation.matches)];
  process.stderr.write(`- ${violation.path}: ${uniqueMatches.join(', ')}\n`);
}

process.exit(1);
