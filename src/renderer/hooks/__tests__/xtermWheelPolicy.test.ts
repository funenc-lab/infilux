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
        cellHeightPx: 20,
        devicePixelRatio: 2,
      })
    ).toEqual({
      action: 'delegate',
      carryY: 0,
    });
  });

  it('maps a physical wheel tick to a single page-up sequence using xterm-style carry handling', () => {
    expect(
      resolveAgentWheelPolicy({
        kind: 'agent',
        activeBufferType: 'alternate',
        mouseTrackingMode: 'none',
        deltaMode: DOM_DELTA_PIXEL,
        deltaY: -120,
        carryY: 0,
        cellHeightPx: 20,
        devicePixelRatio: 2,
      })
    ).toEqual({
      action: 'consume',
      carryY: 0,
      repeat: 1,
      sequence: PAGE_UP_SEQUENCE,
    });
  });

  it('treats modest trackpad deltas as a scroll step instead of swallowing them behind a large fixed threshold', () => {
    const decision = resolveAgentWheelPolicy({
      kind: 'agent',
      activeBufferType: 'alternate',
      mouseTrackingMode: 'none',
      deltaMode: DOM_DELTA_PIXEL,
      deltaY: -40,
      carryY: 0,
      cellHeightPx: 20,
      devicePixelRatio: 2,
    });

    expect(decision.action).toBe('consume');
    if (decision.action !== 'consume') {
      return;
    }
    expect(decision.repeat).toBe(1);
    expect(decision.sequence).toBe(PAGE_UP_SEQUENCE);
    expect(decision.carryY).toBeCloseTo(-0.2, 5);
  });

  it('accumulates small trackpad deltas with xterm-compatible partial carry', () => {
    const first = resolveAgentWheelPolicy({
      kind: 'agent',
      activeBufferType: 'alternate',
      mouseTrackingMode: 'none',
      deltaMode: DOM_DELTA_PIXEL,
      deltaY: 15,
      carryY: 0,
      cellHeightPx: 20,
      devicePixelRatio: 2,
    });

    expect(first.action).toBe('consume');
    if (first.action !== 'consume') {
      return;
    }
    expect(first.repeat).toBe(0);
    expect(first.sequence).toBeNull();
    expect(first.carryY).toBeCloseTo(0.45, 5);

    const second = resolveAgentWheelPolicy({
      kind: 'agent',
      activeBufferType: 'alternate',
      mouseTrackingMode: 'none',
      deltaMode: DOM_DELTA_PIXEL,
      deltaY: 15,
      carryY: first.carryY,
      cellHeightPx: 20,
      devicePixelRatio: 2,
    });

    expect(second.action).toBe('consume');
    if (second.action !== 'consume') {
      return;
    }
    expect(second.repeat).toBe(0);
    expect(second.sequence).toBeNull();
    expect(second.carryY).toBeCloseTo(0.9, 5);

    const third = resolveAgentWheelPolicy({
      kind: 'agent',
      activeBufferType: 'alternate',
      mouseTrackingMode: 'none',
      deltaMode: DOM_DELTA_PIXEL,
      deltaY: 15,
      carryY: second.carryY,
      cellHeightPx: 20,
      devicePixelRatio: 2,
    });

    expect(third.action).toBe('consume');
    if (third.action !== 'consume') {
      return;
    }
    expect(third.repeat).toBe(1);
    expect(third.sequence).toBe(PAGE_DOWN_SEQUENCE);
    expect(third.carryY).toBeCloseTo(0.35, 5);
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
        cellHeightPx: 20,
        devicePixelRatio: 2,
      })
    ).toEqual({
      action: 'delegate',
      carryY: 0,
    });
  });
});
