import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { collectRendererFilePaths } from '../check-renderer-theme-colors';

const temporaryRoots: string[] = [];

afterEach(() => {
  while (temporaryRoots.length > 0) {
    const temporaryRoot = temporaryRoots.pop();
    if (temporaryRoot) {
      rmSync(temporaryRoot, { recursive: true, force: true });
    }
  }
});

describe('collectRendererFilePaths', () => {
  it('collects only renderer source files with supported extensions', () => {
    const projectRoot = mkdtempSync(path.join(os.tmpdir(), 'renderer-theme-audit-'));
    temporaryRoots.push(projectRoot);

    mkdirSync(path.join(projectRoot, 'src/renderer/components'), { recursive: true });
    mkdirSync(path.join(projectRoot, 'src/renderer/styles'), { recursive: true });
    mkdirSync(path.join(projectRoot, 'src/main'), { recursive: true });

    writeFileSync(path.join(projectRoot, 'src/renderer/App.tsx'), 'export const App = null;\n');
    writeFileSync(
      path.join(projectRoot, 'src/renderer/components/Panel.ts'),
      'export const panel = 1;\n'
    );
    writeFileSync(path.join(projectRoot, 'src/renderer/styles/theme.css'), ':root {}\n');
    writeFileSync(path.join(projectRoot, 'src/renderer/components/ignored.md'), '# ignored\n');
    writeFileSync(path.join(projectRoot, 'src/main/index.ts'), 'export {};\n');

    expect(collectRendererFilePaths(projectRoot)).toEqual([
      path.join('src/renderer/App.tsx'),
      path.join('src/renderer/components/Panel.ts'),
      path.join('src/renderer/styles/theme.css'),
    ]);
  });
});
