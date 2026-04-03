import type { SessionKind } from '@shared/types';

export const DOM_DELTA_PIXEL = 0;
export const DOM_DELTA_LINE = 1;
export const DOM_DELTA_PAGE = 2;

export const PAGE_UP_SEQUENCE = '\x1b[5~';
export const PAGE_DOWN_SEQUENCE = '\x1b[6~';

const PIXEL_PAGE_THRESHOLD = 96;
const LINE_PAGE_THRESHOLD = 3;
const PAGE_THRESHOLD = 1;
const MAX_PAGE_TURNS_PER_EVENT = 3;

export type XtermBufferType = 'normal' | 'alternate';
export type XtermMouseTrackingMode = 'none' | 'x10' | 'vt200' | 'drag' | 'any';

interface AgentWheelPolicyInput {
  kind: SessionKind;
  activeBufferType: XtermBufferType;
  mouseTrackingMode: XtermMouseTrackingMode;
  deltaMode: number;
  deltaY: number;
  carryY: number;
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

function getWheelThreshold(deltaMode: number): number {
  switch (deltaMode) {
    case DOM_DELTA_LINE:
      return LINE_PAGE_THRESHOLD;
    case DOM_DELTA_PAGE:
      return PAGE_THRESHOLD;
    default:
      return PIXEL_PAGE_THRESHOLD;
  }
}

function clampPageTurns(pageTurns: number): number {
  if (pageTurns > MAX_PAGE_TURNS_PER_EVENT) {
    return MAX_PAGE_TURNS_PER_EVENT;
  }
  if (pageTurns < -MAX_PAGE_TURNS_PER_EVENT) {
    return -MAX_PAGE_TURNS_PER_EVENT;
  }
  return pageTurns;
}

export function resolveAgentWheelPolicy(input: AgentWheelPolicyInput): AgentWheelPolicyDecision {
  const { kind, activeBufferType, mouseTrackingMode, deltaMode, deltaY, carryY } = input;

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
      carryY,
      repeat: 0,
      sequence: null,
    };
  }

  const threshold = getWheelThreshold(deltaMode);
  const totalDelta = carryY + deltaY;
  const rawPageTurns = Math.trunc(totalDelta / threshold);
  const pageTurns = clampPageTurns(rawPageTurns);
  const nextCarryY = totalDelta - pageTurns * threshold;

  if (pageTurns === 0) {
    return {
      action: 'consume',
      carryY: nextCarryY,
      repeat: 0,
      sequence: null,
    };
  }

  return {
    action: 'consume',
    carryY: nextCarryY,
    repeat: Math.abs(pageTurns),
    sequence: pageTurns < 0 ? PAGE_UP_SEQUENCE : PAGE_DOWN_SEQUENCE,
  };
}
