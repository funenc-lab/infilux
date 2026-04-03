import type { SessionKind } from '@shared/types';

export const DOM_DELTA_PIXEL = 0;
export const DOM_DELTA_LINE = 1;
export const DOM_DELTA_PAGE = 2;

export const PAGE_UP_SEQUENCE = '\x1b[5~';
export const PAGE_DOWN_SEQUENCE = '\x1b[6~';

const TRACKPAD_PIXEL_DELTA_THRESHOLD = 50;

export type XtermBufferType = 'normal' | 'alternate';
export type XtermMouseTrackingMode = 'none' | 'x10' | 'vt200' | 'drag' | 'any';

interface AgentWheelPolicyInput {
  kind: SessionKind;
  activeBufferType: XtermBufferType;
  mouseTrackingMode: XtermMouseTrackingMode;
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
      action: 'consume';
      carryY: number;
      repeat: number;
      sequence: string | null;
    };

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
  const { kind, activeBufferType, mouseTrackingMode, deltaY } = input;

  const shouldRemapWheel =
    kind === 'agent' && activeBufferType === 'alternate' && mouseTrackingMode === 'none';

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
      repeat: 0,
      sequence: null,
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
      repeat: 0,
      sequence: null,
    };
  }

  return {
    action: 'consume',
    carryY,
    repeat: 1,
    sequence: steps < 0 ? PAGE_UP_SEQUENCE : PAGE_DOWN_SEQUENCE,
  };
}
