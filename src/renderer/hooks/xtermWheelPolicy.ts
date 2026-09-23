import type { SessionKind } from '@shared/types';
import { getAgentInputBaseId } from '@shared/utils/agentInputMode';

export const DOM_DELTA_PIXEL = 0;
export const DOM_DELTA_LINE = 1;
export const DOM_DELTA_PAGE = 2;
export const PAGE_UP_SEQUENCE = '\x1b[5~';
export const PAGE_DOWN_SEQUENCE = '\x1b[6~';

const TRACKPAD_PIXEL_DELTA_THRESHOLD = 50;
const PROGRAM_SCROLL_LINES_PER_PAGE = 8;
const MAX_PROGRAM_SCROLL_PAGES_PER_EVENT = 3;

export type XtermBufferType = 'normal' | 'alternate';
export type XtermMouseTrackingMode = 'none' | 'x10' | 'vt200' | 'drag' | 'any';
export type XtermHostScrollMode = 'tmux';
interface AgentWheelPolicyInput {
  agentId?: string;
  kind: SessionKind;
  activeBufferType: XtermBufferType;
  mouseTrackingMode: XtermMouseTrackingMode;
  hostScrollMode?: XtermHostScrollMode;
  deltaMode: number;
  deltaY: number;
  carryY: number;
  cellHeightPx?: number;
  devicePixelRatio?: number;
}

type AgentWheelPolicyDecision =
  | {
      action: 'delegate';
      carryY: number;
    }
  | {
      action: 'host-scroll';
      carryY: number;
      scrollLines: number;
      fallbackToProgramScroll?: boolean;
    }
  | {
      action: 'program-scroll';
      carryY: number;
      sequence: string;
      repeat: number;
    }
  | {
      action: 'consume';
      carryY: number;
      scrollLines: number;
    };

export function resolveAgentProgramScrollRepeat(scrollLines: number): number {
  return Math.min(
    MAX_PROGRAM_SCROLL_PAGES_PER_EVENT,
    Math.max(1, Math.ceil(Math.abs(scrollLines) / PROGRAM_SCROLL_LINES_PER_PAGE))
  );
}

function normalizePixelWheelDelta(
  deltaY: number,
  carryY: number,
  cellHeightPx?: number,
  devicePixelRatio?: number
): { steps: number; carryY: number } | null {
  if (
    !cellHeightPx ||
    !devicePixelRatio ||
    !Number.isFinite(cellHeightPx) ||
    !Number.isFinite(devicePixelRatio) ||
    cellHeightPx <= 0 ||
    devicePixelRatio <= 0
  ) {
    return null;
  }

  let amount = deltaY / (cellHeightPx / devicePixelRatio);
  if (Math.abs(deltaY) < TRACKPAD_PIXEL_DELTA_THRESHOLD) {
    amount *= 0.3;
  }

  const totalAmount = carryY + amount;
  const steps = Math.trunc(totalAmount);

  return {
    steps,
    carryY: totalAmount - steps,
  };
}

function normalizeWheelDelta(
  input: AgentWheelPolicyInput
): { steps: number; carryY: number } | null {
  const { deltaMode, deltaY, carryY, cellHeightPx, devicePixelRatio } = input;

  switch (deltaMode) {
    case DOM_DELTA_PIXEL:
      return normalizePixelWheelDelta(deltaY, carryY, cellHeightPx, devicePixelRatio);
    case DOM_DELTA_PAGE: {
      const totalAmount = carryY + deltaY;
      const steps = Math.trunc(totalAmount);
      return {
        steps,
        carryY: totalAmount - steps,
      };
    }
    default: {
      const totalAmount = carryY + deltaY;
      const steps = Math.trunc(totalAmount);
      return {
        steps,
        carryY: totalAmount - steps,
      };
    }
  }
}

export function resolveAgentWheelPolicy(input: AgentWheelPolicyInput): AgentWheelPolicyDecision {
  const { activeBufferType, agentId, hostScrollMode, kind, mouseTrackingMode, deltaY } = input;
  const isClaudeAlternateBuffer =
    kind === 'agent' &&
    activeBufferType === 'alternate' &&
    typeof agentId === 'string' &&
    getAgentInputBaseId(agentId) === 'claude';

  const shouldRemapWheel =
    kind === 'agent' &&
    (hostScrollMode === 'tmux' ||
      activeBufferType === 'normal' ||
      mouseTrackingMode === 'none' ||
      isClaudeAlternateBuffer);

  if (!shouldRemapWheel) {
    return {
      action: 'delegate',
      carryY: 0,
    };
  }

  if (deltaY === 0) {
    return {
      action: 'consume',
      carryY: input.carryY,
      scrollLines: 0,
    };
  }

  const normalizedWheelDelta = normalizeWheelDelta(input);
  if (!normalizedWheelDelta) {
    return {
      action: 'delegate',
      carryY: 0,
    };
  }

  const { steps, carryY } = normalizedWheelDelta;

  if (steps === 0) {
    return {
      action: 'consume',
      carryY,
      scrollLines: 0,
    };
  }

  if (hostScrollMode === 'tmux') {
    return {
      action: 'host-scroll',
      carryY,
      scrollLines: steps,
      ...(isClaudeAlternateBuffer ? { fallbackToProgramScroll: true } : {}),
    };
  }

  if (input.activeBufferType === 'alternate') {
    return {
      action: 'program-scroll',
      carryY,
      sequence: steps < 0 ? PAGE_UP_SEQUENCE : PAGE_DOWN_SEQUENCE,
      repeat: resolveAgentProgramScrollRepeat(steps),
    };
  }

  return {
    action: 'consume',
    carryY,
    scrollLines: steps,
  };
}
