import { describe, expect, it } from 'vitest';

describe('agent session layout index', () => {
  it('builds a per-session placement index and preserves active visibility', async () => {
    const module = await import('../agentSessionLayoutIndex').catch(() => null);

    expect(
      module?.buildAgentSessionPlacementIndex({
        '/worktree-a': {
          activeGroupId: 'group-a',
          flexPercents: [40, 60],
          groups: [
            {
              activeSessionId: 'session-1',
              id: 'group-a',
              sessionIds: ['session-1', 'session-2'],
            },
            {
              activeSessionId: 'session-3',
              id: 'group-b',
              sessionIds: ['session-3'],
            },
          ],
        },
      })
    ).toEqual(
      new Map([
        [
          'session-1',
          {
            groupId: 'group-a',
            groupIndex: 0,
            isVisible: true,
            left: 0,
            width: 40,
            worktreePath: '/worktree-a',
          },
        ],
        [
          'session-2',
          {
            groupId: 'group-a',
            groupIndex: 0,
            isVisible: false,
            left: 0,
            width: 40,
            worktreePath: '/worktree-a',
          },
        ],
        [
          'session-3',
          {
            groupId: 'group-b',
            groupIndex: 1,
            isVisible: true,
            left: 40,
            width: 60,
            worktreePath: '/worktree-a',
          },
        ],
      ])
    );
  });

  it('resolves cumulative group positions from flex percentages', async () => {
    const module = await import('../agentSessionLayoutIndex').catch(() => null);

    expect(
      module?.resolveAgentGroupPositions({
        activeGroupId: 'group-a',
        flexPercents: [25, 35, 40],
        groups: [],
      })
    ).toEqual([
      { left: 0, width: 25 },
      { left: 25, width: 35 },
      { left: 60, width: 40 },
    ]);
  });
});
