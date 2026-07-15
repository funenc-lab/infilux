import { describe, expect, it } from 'vitest';
import { DOM_DELTA_LINE, DOM_DELTA_PIXEL, resolveAgentWheelPolicy } from '../xtermWheelPolicy';

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

  it('maps wheel input to viewport scrolling for agent terminals in the normal buffer when mouse tracking is disabled', () => {
    expect(
      resolveAgentWheelPolicy({
        kind: 'agent',
        activeBufferType: 'normal',
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
      scrollLines: -12,
    });
  });

  it('keeps agent session windows scrollable when terminal mouse tracking is disabled', () => {
    const decision = resolveAgentWheelPolicy({
      kind: 'agent',
      activeBufferType: 'normal',
      mouseTrackingMode: 'none',
      deltaMode: DOM_DELTA_LINE,
      deltaY: 6,
      carryY: 0,
      cellHeightPx: 20,
      devicePixelRatio: 2,
    });

    expect(decision).toEqual({
      action: 'consume',
      carryY: 0,
      scrollLines: 6,
    });
  });

  it('routes normal-buffer wheel input to tmux host scrolling when recovered agent history lives in tmux', () => {
    expect(
      resolveAgentWheelPolicy({
        kind: 'agent',
        activeBufferType: 'normal',
        mouseTrackingMode: 'none',
        hostScrollMode: 'tmux',
        deltaMode: DOM_DELTA_PIXEL,
        deltaY: -120,
        carryY: 0,
        cellHeightPx: 20,
        devicePixelRatio: 2,
      })
    ).toEqual({
      action: 'host-scroll',
      carryY: 0,
      scrollLines: -12,
    });
  });

  it('sends alternate-buffer wheel input to the agent program so new interactive sessions can scroll', () => {
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
      action: 'program-scroll',
      carryY: 0,
      sequence: '\x1b[5~',
      repeat: 2,
    });
  });

  it('routes alternate-buffer wheel input to tmux host scrolling when recovered agent history lives in tmux', () => {
    expect(
      resolveAgentWheelPolicy({
        kind: 'agent',
        activeBufferType: 'alternate',
        mouseTrackingMode: 'none',
        hostScrollMode: 'tmux',
        deltaMode: DOM_DELTA_PIXEL,
        deltaY: -120,
        carryY: 0,
        cellHeightPx: 20,
        devicePixelRatio: 2,
      })
    ).toEqual({
      action: 'host-scroll',
      carryY: 0,
      scrollLines: -12,
    });
  });

  it('turns modest alternate-buffer trackpad deltas into agent program scroll input', () => {
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

    expect(decision).toMatchObject({
      action: 'program-scroll',
      sequence: '\x1b[5~',
      repeat: 1,
    });
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
    expect(first.scrollLines).toBe(0);
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
    expect(second.scrollLines).toBe(0);
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

    expect(third).toMatchObject({
      action: 'program-scroll',
      sequence: '\x1b[6~',
      repeat: 1,
    });
    expect(third.carryY).toBeCloseTo(0.35, 5);
  });

  it('delegates wheel input back to the terminal program when the agent enables mouse tracking', () => {
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

  it('keeps recovered tmux sessions on host scrolling even when xterm reports mouse tracking', () => {
    expect(
      resolveAgentWheelPolicy({
        kind: 'agent',
        activeBufferType: 'alternate',
        mouseTrackingMode: 'any',
        hostScrollMode: 'tmux',
        deltaMode: DOM_DELTA_LINE,
        deltaY: 3,
        carryY: 0,
        cellHeightPx: 20,
        devicePixelRatio: 2,
      })
    ).toEqual({
      action: 'host-scroll',
      carryY: 0,
      scrollLines: 3,
    });
  });
});
