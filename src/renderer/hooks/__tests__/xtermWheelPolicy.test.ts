import { describe, expect, it } from 'vitest';
import {
  DOM_DELTA_LINE,
  DOM_DELTA_PIXEL,
  PAGE_DOWN_SEQUENCE,
  PAGE_UP_SEQUENCE,
  resolveAgentWheelPolicy,
} from '../xtermWheelPolicy';

describe('xtermWheelPolicy', () => {
  it('delegates wheel handling for non-agent terminals', () => {
    expect(
      resolveAgentWheelPolicy({
        kind: 'terminal',
        activeBufferType: 'alternate',
        mouseTrackingMode: 'none',
        deltaMode: DOM_DELTA_PIXEL,
        deltaY: -120,
        carryY: 0,
      })
    ).toEqual({
      action: 'delegate',
      carryY: 0,
    });
  });

  it('consumes alternate-buffer wheel events for agent terminals without mouse tracking', () => {
    expect(
      resolveAgentWheelPolicy({
        kind: 'agent',
        activeBufferType: 'alternate',
        mouseTrackingMode: 'none',
        deltaMode: DOM_DELTA_PIXEL,
        deltaY: -120,
        carryY: 0,
      })
    ).toEqual({
      action: 'consume',
      carryY: -24,
      repeat: 1,
      sequence: PAGE_UP_SEQUENCE,
    });
  });

  it('accumulates touchpad deltas until a full page turn is reached', () => {
    const first = resolveAgentWheelPolicy({
      kind: 'agent',
      activeBufferType: 'alternate',
      mouseTrackingMode: 'none',
      deltaMode: DOM_DELTA_PIXEL,
      deltaY: 45,
      carryY: 0,
    });

    expect(first).toEqual({
      action: 'consume',
      carryY: 45,
      repeat: 0,
      sequence: null,
    });

    expect(
      resolveAgentWheelPolicy({
        kind: 'agent',
        activeBufferType: 'alternate',
        mouseTrackingMode: 'none',
        deltaMode: DOM_DELTA_PIXEL,
        deltaY: 60,
        carryY: first.carryY,
      })
    ).toEqual({
      action: 'consume',
      carryY: 9,
      repeat: 1,
      sequence: PAGE_DOWN_SEQUENCE,
    });
  });

  it('keeps xterm mouse-wheel reporting when the TUI explicitly enables mouse tracking', () => {
    expect(
      resolveAgentWheelPolicy({
        kind: 'agent',
        activeBufferType: 'alternate',
        mouseTrackingMode: 'any',
        deltaMode: DOM_DELTA_LINE,
        deltaY: 3,
        carryY: 0,
      })
    ).toEqual({
      action: 'delegate',
      carryY: 0,
    });
  });
});
