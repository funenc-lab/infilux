import { describe, expect, it } from 'vitest';
import { ALL_GROUP_ID, type RepositoryGroup } from '../../constants';
import { resolveActiveGroupId } from '../activeGroupPolicy';

const GROUPS: RepositoryGroup[] = [
  {
    id: 'group-a',
    name: 'Group A',
    emoji: 'A',
    color: '#111111',
    order: 0,
  },
  {
    id: 'group-b',
    name: 'Group B',
    emoji: 'B',
    color: '#222222',
    order: 1,
  },
];

describe('resolveActiveGroupId', () => {
  it('falls back to all when groups are hidden', () => {
    expect(
      resolveActiveGroupId({
        hideGroups: true,
        activeGroupId: 'group-a',
        groups: GROUPS,
      })
    ).toBe(ALL_GROUP_ID);
  });

  it('falls back to all when the active group no longer exists', () => {
    expect(
      resolveActiveGroupId({
        hideGroups: false,
        activeGroupId: 'missing-group',
        groups: GROUPS,
      })
    ).toBe(ALL_GROUP_ID);
  });

  it('keeps a valid active group when it still exists', () => {
    expect(
      resolveActiveGroupId({
        hideGroups: false,
        activeGroupId: 'group-b',
        groups: GROUPS,
      })
    ).toBe('group-b');
  });
});
