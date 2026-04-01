import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function readAppSource(): string {
  return readFileSync(join(process.cwd(), 'src/renderer/App.tsx'), 'utf8');
}

describe('App main content deferral policy', () => {
  it('loads MainContent through a deferred wrapper instead of a direct static import', () => {
    const source = readAppSource();

    expect(source).toContain(
      "import { DeferredMainContent } from './components/layout/DeferredMainContent';"
    );
    expect(source).not.toContain("import { MainContent } from './components/layout/MainContent';");
    expect(source).toContain('<DeferredMainContent');
  });
});
