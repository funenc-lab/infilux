import { describe, expect, it } from 'vitest';
import {
  didExpansionChangeAffectSubtree,
  didPathChangeAffectSubtree,
  isPathInSubtree,
} from '../fileTreeRenderUtils';

describe('fileTreeRenderUtils', () => {
  it('detects whether a path belongs to a subtree', () => {
    expect(isPathInSubtree('/repo/src/components/FileTree.tsx', '/repo/src')).toBe(true);
    expect(isPathInSubtree('/repo/docs/readme.md', '/repo/src')).toBe(false);
    expect(isPathInSubtree(null, '/repo/src')).toBe(false);
  });

  it('flags selection changes that enter or leave a subtree', () => {
    expect(
      didPathChangeAffectSubtree(
        '/repo/src/components/Old.tsx',
        '/repo/src/components/New.tsx',
        '/repo/src'
      )
    ).toBe(true);

    expect(
      didPathChangeAffectSubtree('/repo/docs/readme.md', '/repo/docs/changelog.md', '/repo/src')
    ).toBe(false);
  });

  it('flags expansion changes only when the subtree itself is affected', () => {
    expect(
      didExpansionChangeAffectSubtree(
        new Set(['/repo/src']),
        new Set(['/repo/src', '/repo/src/components']),
        '/repo/src'
      )
    ).toBe(true);

    expect(
      didExpansionChangeAffectSubtree(
        new Set(['/repo/docs']),
        new Set(['/repo/docs', '/repo/docs/guides']),
        '/repo/src'
      )
    ).toBe(false);
  });
});
