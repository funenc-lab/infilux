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

  it('maps alternate-buffer wheel input to viewport scrolling so agent transcript history moves instead of terminal input history', () => {
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
      scrollLines: -12,
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

  it('treats modest trackpad deltas as viewport scroll steps instead of swallowing them behind a large fixed threshold', () => {
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
    expect(decision.scrollLines).toBe(-1);
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

    expect(third.action).toBe('consume');
    if (third.action !== 'consume') {
      return;
    }
    expect(third.scrollLines).toBe(1);
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
