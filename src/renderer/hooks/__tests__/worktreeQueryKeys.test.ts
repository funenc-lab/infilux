import { describe, expect, it } from 'vitest';
import { worktreeQueryKeys } from '../worktreeQueryKeys';

describe('worktreeQueryKeys', () => {
  it('uses one shared list scope for single and multi-repository worktree queries', () => {
    expect(worktreeQueryKeys.lists()).toEqual(['worktree', 'list']);
    expect(worktreeQueryKeys.list('/repo/main')).toEqual(['worktree', 'list', '/repo/main']);
  });

  it('keeps null workdirs serializable for disabled single-repository queries', () => {
    expect(worktreeQueryKeys.list(null)).toEqual(['worktree', 'list', null]);
  });
});
