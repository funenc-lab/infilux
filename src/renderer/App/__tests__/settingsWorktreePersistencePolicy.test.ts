import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function readAppSource(): string {
  return readFileSync(join(process.cwd(), 'src/renderer/App.tsx'), 'utf8');
}

describe('settings worktree persistence policy', () => {
  it('routes floating settings close and worktree restore through the shared persistence guards', () => {
    const source = readAppSource();

    expect(source).toContain('const currentWorktreeTabToPersist = useMemo(');
    expect(source).toContain('[activeWorktree.path]: currentWorktreeTabToPersist');
    expect(source).toContain('resolveWorktreeTabForRestore({');
    expect(source).toContain('onSettingsWindowOpenChange={handleSettingsDialogOpenChange}');
    expect(source).toContain('onToggleSettings={toggleSettings}');
  });
});
