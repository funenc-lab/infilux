import { describe, expect, it } from 'vitest';
import { selectNextTempWorkspacePath } from '../tempWorkspaceActionModel';

describe('useTempWorkspaceActions helpers', () => {
  it('selects the next remaining temp workspace path after the removed item', () => {
    const nextPath = selectNextTempWorkspacePath(
      [
        { id: 'temp-1', path: '/tmp/a' },
        { id: 'temp-2', path: '/tmp/b' },
      ],
      'temp-1'
    );

    expect(nextPath).toBe('/tmp/b');
  });

  it('returns null when the removed item was the last temp workspace', () => {
    const nextPath = selectNextTempWorkspacePath([{ id: 'temp-1', path: '/tmp/a' }], 'temp-1');

    expect(nextPath).toBeNull();
  });

  it('returns null when the removed item cannot be found', () => {
    const nextPath = selectNextTempWorkspacePath([{ id: 'temp-1', path: '/tmp/a' }], 'missing');

    expect(nextPath).toBeNull();
  });
});
