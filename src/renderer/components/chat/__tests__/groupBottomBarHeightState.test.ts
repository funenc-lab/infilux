import { describe, expect, it } from 'vitest';
import { clearGroupBottomBarHeight, setGroupBottomBarHeight } from '../groupBottomBarHeightState';

describe('groupBottomBarHeightState', () => {
  it('stores a measured height for the current group', () => {
    expect(setGroupBottomBarHeight({}, 'group-a', 48)).toEqual({
      'group-a': 48,
    });
  });

  it('returns the original object when the stored height is unchanged', () => {
    const previousHeights = {
      'group-a': 48,
    };

    expect(setGroupBottomBarHeight(previousHeights, 'group-a', 48)).toBe(previousHeights);
  });

  it('removes a group entry during unmount cleanup', () => {
    expect(
      clearGroupBottomBarHeight(
        {
          'group-a': 48,
          'group-b': 32,
        },
        'group-a'
      )
    ).toEqual({
      'group-b': 32,
    });
  });
});
