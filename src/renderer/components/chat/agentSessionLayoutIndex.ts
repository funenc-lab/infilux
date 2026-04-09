import type { AgentGroupState } from './types';

export type AgentGroupPosition = {
  left: number;
  width: number;
};

export type AgentSessionPlacement = {
  groupId: string;
  groupIndex: number;
  isVisible: boolean;
  left: number;
  width: number;
  worktreePath: string;
};

export function resolveAgentGroupPositions(state: AgentGroupState): AgentGroupPosition[] {
  const positions: AgentGroupPosition[] = [];
  let cumulative = 0;

  for (const percent of state.flexPercents) {
    positions.push({ left: cumulative, width: percent });
    cumulative += percent;
  }

  return positions;
}

export function buildAgentSessionPlacementIndex(
  worktreeGroupStates: Record<string, AgentGroupState>
): Map<string, AgentSessionPlacement> {
  const placementBySessionId = new Map<string, AgentSessionPlacement>();

  for (const [worktreePath, state] of Object.entries(worktreeGroupStates)) {
    const positions = resolveAgentGroupPositions(state);

    for (let groupIndex = 0; groupIndex < state.groups.length; groupIndex += 1) {
      const group = state.groups[groupIndex];
      const position = positions[groupIndex] ?? { left: 0, width: 100 };

      for (const sessionId of group.sessionIds) {
        placementBySessionId.set(sessionId, {
          groupId: group.id,
          groupIndex,
          isVisible: group.activeSessionId === sessionId,
          left: position.left,
          width: position.width,
          worktreePath,
        });
      }
    }
  }

  return placementBySessionId;
}
