import { describe, expect, it } from 'vitest';
import { getDisplayPathRelativeToRoot } from '../editorPathDisplay';

describe('editorPathDisplay', () => {
  it('returns a root-relative path for files inside the active root', () => {
    expect(
      getDisplayPathRelativeToRoot(
        '/Users/tanzv/Development/Git/EnsoAI/src/renderer/App.tsx',
        '/Users/tanzv/Development/Git/EnsoAI'
      )
    ).toBe('src/renderer/App.tsx');
  });

  it('keeps absolute paths for files outside the active root', () => {
    expect(
      getDisplayPathRelativeToRoot(
        '/Users/tanzv/Development/Project/cvat/README.md',
        '/Users/tanzv/Development/Git/EnsoAI'
      )
    ).toBe('/Users/tanzv/Development/Project/cvat/README.md');
  });

  it('recovers duplicated root-prefixed absolute paths before computing relative display paths', () => {
    expect(
      getDisplayPathRelativeToRoot(
        '/Users/tanzv/Development/Git/EnsoAI//Users/tanzv/Development/Git/penpad/apps/studio/docs/agent/guide.md',
        '/Users/tanzv/Development/Git/penpad'
      )
    ).toBe('apps/studio/docs/agent/guide.md');
  });

  it('matches root-relative files using normalized path keys', () => {
    expect(
      getDisplayPathRelativeToRoot(
        '/users/tanzv/development/git/ensoai/src/app.tsx',
        '/Users/Tanzv/Development/Git/EnsoAI'
      )
    ).toBe('src/app.tsx');
  });
});
