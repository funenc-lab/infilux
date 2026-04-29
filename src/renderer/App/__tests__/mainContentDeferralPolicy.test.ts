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

  it('keeps global todo repository switching inside the main content routing boundary', () => {
    const source = readAppSource();

    expect(source).toContain('const handleSwitchTodoRepository = useCallback');
    expect(source).toContain('handleSelectRepo(repoPath, { activateRemote: true });');
    expect(source).toContain("setActiveTab('todo');");
    expect(source).toContain('onSwitchRepository={handleSwitchTodoRepository}');
  });
});
