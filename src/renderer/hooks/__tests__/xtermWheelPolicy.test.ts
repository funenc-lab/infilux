import { describe, expect, it } from 'vitest';
import {
  DOM_DELTA_LINE,
  DOM_DELTA_PAGE,
  DOM_DELTA_PIXEL,
  resolveAgentScrollOwner,
  resolveAgentWheelPolicy,
} from '../xtermWheelPolicy';

describe('xtermWheelPolicy', () => {
  it.each([
    [1, false],
    [2, false],
    [1, true],
    [2, true],
  ])('keeps equal pixel gestures consistent across event sizes (scale=%s, host=%s)', (devicePixelRatio, hosted) => {
    const input = {
      agentId: 'codex',
      kind: 'agent' as const,
      activeBufferType: hosted ? ('alternate' as const) : ('normal' as const),
      mouseTrackingMode: 'none' as const,
      hostScrollMode: hosted ? ('tmux' as const) : undefined,
      deltaMode: DOM_DELTA_PIXEL,
      cellHeightPx: 20 * devicePixelRatio,
      devicePixelRatio,
    };
    for (const deltas of [Array<number>(50).fill(-10), Array<number>(10).fill(-50)]) {
      let carryY = 0;
      let lines = 0;
      for (const deltaY of deltas) {
        const decision = resolveAgentWheelPolicy({ ...input, deltaY, carryY });
        expect(hosted ? ['host-scroll', 'consume'] : ['consume']).toContain(decision.action);
        if (decision.action === 'host-scroll' || decision.action === 'consume') {
          lines += decision.scrollLines;
        }
        carryY = decision.carryY;
      }
      expect(lines).toBe(-7);
      expect(carryY).toBeCloseTo(-0.5, 8);
    }
  });

  it('does not accelerate pixel scrolling at the former trackpad threshold', () => {
    for (const deltaY of [-49, -50, -51]) {
      const decision = resolveAgentWheelPolicy({
        kind: 'agent',
        activeBufferType: 'normal',
        mouseTrackingMode: 'none',
        deltaMode: DOM_DELTA_PIXEL,
        deltaY,
        carryY: 0,
        cellHeightPx: 40,
        devicePixelRatio: 2,
      });
      expect(decision).toMatchObject({ action: 'consume', scrollLines: 0 });
      expect(decision.carryY).toBeCloseTo((deltaY / 20) * 0.3, 8);
    }
  });

  it.each([
    -1, 1,
  ])('reaches a whole compatibility page with fragmented pixel deltas (direction=%s)', (direction) => {
    const input = {
      agentId: 'codex',
      kind: 'agent' as const,
      activeBufferType: 'alternate' as const,
      mouseTrackingMode: 'none' as const,
      deltaMode: DOM_DELTA_PIXEL,
      cellHeightPx: 20,
      devicePixelRatio: 1,
      viewportRows: 24,
    };
    for (const deltas of [
      Array<number>(160).fill(10 * direction),
      Array<number>(32).fill(50 * direction),
    ]) {
      let carryY = 0;
      let pages = 0;
      for (const deltaY of deltas) {
        const decision = resolveAgentWheelPolicy({ ...input, deltaY, carryY });
        if (decision.action === 'program-scroll') {
          pages += decision.repeat;
          expect(decision.sequence).toBe(direction < 0 ? '\x1b[5~' : '\x1b[6~');
        }
        carryY = decision.carryY;
      }
      expect(pages).toBe(1);
      expect(carryY).toBe(0);
      const next = resolveAgentWheelPolicy({ ...input, deltaY: direction, carryY });
      expect(next).toMatchObject({ action: 'consume', scrollLines: 0 });
      expect(next.carryY).toBeCloseTo(0.015 * direction, 8);
    }
  });

  it.each([-1, 1])('drops old whole-page carry when the viewport shrinks (delta=%s)', (deltaY) => {
    const input = {
      agentId: 'codex',
      kind: 'agent' as const,
      activeBufferType: 'alternate' as const,
      mouseTrackingMode: 'none' as const,
      deltaMode: DOM_DELTA_LINE,
    };
    const previous = resolveAgentWheelPolicy({
      ...input,
      deltaY: -36,
      carryY: 0,
      viewportRows: 40,
    });
    expect(previous).toEqual({ action: 'consume', scrollLines: 0, carryY: -36 });
    expect(
      resolveAgentWheelPolicy({ ...input, deltaY, carryY: previous.carryY, viewportRows: 20 })
    ).toEqual({ action: 'consume', scrollLines: 0, carryY: -16 + deltaY });
  });

  it.each([16, 40, 64])('waits for %s visible rows before compatibility paging', (viewportRows) => {
    const input = {
      agentId: 'codex',
      kind: 'agent' as const,
      activeBufferType: 'alternate' as const,
      mouseTrackingMode: 'none' as const,
      deltaMode: DOM_DELTA_LINE,
      deltaY: -4,
      viewportRows,
    };
    let carryY = 0;
    for (let index = 0; index < viewportRows / 4 - 1; index += 1) {
      const decision = resolveAgentWheelPolicy({ ...input, carryY });
      expect(decision).toEqual({ action: 'consume', scrollLines: 0, carryY: -(index + 1) * 4 });
      carryY = decision.carryY;
    }
    expect(resolveAgentWheelPolicy({ ...input, carryY })).toEqual({
      action: 'program-scroll',
      sequence: '\x1b[5~',
      repeat: 1,
      carryY: 0,
    });
  });

  it('emits at most one compatibility page and drops whole-page excess', () => {
    const input = {
      agentId: 'claude',
      kind: 'agent' as const,
      activeBufferType: 'alternate' as const,
      mouseTrackingMode: 'none' as const,
      deltaMode: DOM_DELTA_LINE,
      viewportRows: 40,
    };
    const decision = resolveAgentWheelPolicy({ ...input, deltaY: -161, carryY: 0 });
    expect(decision).toEqual({
      action: 'program-scroll',
      sequence: '\x1b[5~',
      repeat: 1,
      carryY: -1,
    });
    expect(resolveAgentWheelPolicy({ ...input, deltaY: -1, carryY: decision.carryY })).toEqual({
      action: 'consume',
      scrollLines: 0,
      carryY: -2,
    });
  });

  it('uses visible rows for browser page units in local history', () => {
    expect(
      resolveAgentWheelPolicy({
        kind: 'agent',
        activeBufferType: 'normal',
        mouseTrackingMode: 'none',
        deltaMode: DOM_DELTA_PAGE,
        deltaY: -0.5,
        carryY: 0,
        viewportRows: 40,
      })
    ).toEqual({ action: 'consume', scrollLines: -20, carryY: 0 });
  });

  it('keeps managed copy mode authoritative even if outer mouse tracking is active', () => {
    expect(
      resolveAgentWheelPolicy({
        agentId: 'codex',
        kind: 'agent',
        activeBufferType: 'normal',
        mouseTrackingMode: 'any',
        hostScrollMode: 'tmux',
        hostInCopyMode: true,
        deltaMode: DOM_DELTA_LINE,
        deltaY: -4,
        carryY: 0,
      })
    ).toEqual({ action: 'host-scroll', scrollLines: -4, carryY: 0, fallbackToProgramScroll: true });
  });

  it('keeps static replay owned by its local viewport', () => {
    expect(
      resolveAgentScrollOwner({
        kind: 'agent',
        activeBufferType: 'alternate',
        mouseTrackingMode: 'any',
        hostScrollMode: 'tmux',
        hostInCopyMode: true,
        isStaticContent: true,
      })
    ).toBe('local');
  });

  it('caps compatibility paging and drops whole-page backlog from large wheel events', () => {
    expect(
      resolveAgentWheelPolicy({
        agentId: 'codex',
        kind: 'agent',
        activeBufferType: 'alternate',
        mouseTrackingMode: 'none',
        deltaMode: DOM_DELTA_LINE,
        deltaY: -121,
        carryY: 0,
      })
    ).toEqual({ action: 'program-scroll', sequence: '\x1b[5~', repeat: 1, carryY: -1 });
  });

  it('honors browser page units instead of treating them as a single line', () => {
    expect(
      resolveAgentWheelPolicy({
        agentId: 'claude',
        kind: 'agent',
        activeBufferType: 'alternate',
        mouseTrackingMode: 'none',
        deltaMode: DOM_DELTA_PAGE,
        deltaY: 2,
        carryY: 0,
      })
    ).toEqual({ action: 'program-scroll', sequence: '\x1b[6~', repeat: 1, carryY: 0 });
  });

  it('cancels partial compatibility carry when the wheel reverses direction', () => {
    expect(
      resolveAgentWheelPolicy({
        agentId: 'codex',
        kind: 'agent',
        activeBufferType: 'alternate',
        mouseTrackingMode: 'none',
        deltaMode: DOM_DELTA_LINE,
        deltaY: 4,
        carryY: -4,
      })
    ).toEqual({ action: 'consume', scrollLines: 0, carryY: 0 });
  });

  it.each([
    'normal',
    'alternate',
  ] as const)('preserves Codex native mouse scrolling in the %s buffer', (activeBufferType) => {
    expect(
      resolveAgentWheelPolicy({
        agentId: 'codex',
        kind: 'agent',
        activeBufferType,
        mouseTrackingMode: 'any',
        hostScrollMode: 'tmux',
        deltaMode: DOM_DELTA_LINE,
        deltaY: -4,
        carryY: 0,
      })
    ).toEqual({ action: 'delegate', carryY: 0 });
  });

  it('keeps normal-buffer tmux history on the same local viewport as the scrollbar', () => {
    expect(
      resolveAgentWheelPolicy({
        agentId: 'codex',
        kind: 'agent',
        activeBufferType: 'normal',
        mouseTrackingMode: 'none',
        hostScrollMode: 'tmux',
        deltaMode: DOM_DELTA_LINE,
        deltaY: -4,
        carryY: 0,
      })
    ).toEqual({ action: 'consume', scrollLines: -4, carryY: 0 });
  });

  it('does not invent page keys for an unidentified alternate-screen program', () => {
    expect(
      resolveAgentWheelPolicy({
        agentId: 'custom-agent',
        kind: 'agent',
        activeBufferType: 'alternate',
        mouseTrackingMode: 'none',
        deltaMode: DOM_DELTA_LINE,
        deltaY: -12,
        carryY: 0,
      })
    ).toEqual({ action: 'consume', scrollLines: 0, carryY: 0 });
  });

  it('accumulates a partial page instead of converting every small native fallback delta into a page', () => {
    const input = {
      agentId: 'codex',
      kind: 'agent' as const,
      activeBufferType: 'alternate' as const,
      mouseTrackingMode: 'none' as const,
      deltaMode: DOM_DELTA_LINE,
      deltaY: -12,
    };
    const first = resolveAgentWheelPolicy({ ...input, carryY: 0 });
    expect(first).toEqual({ action: 'consume', scrollLines: 0, carryY: -12 });
    expect(resolveAgentWheelPolicy({ ...input, carryY: first.carryY })).toEqual({
      action: 'program-scroll',
      sequence: '\x1b[5~',
      repeat: 1,
      carryY: 0,
    });
  });

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
    const decision = resolveAgentWheelPolicy({
      kind: 'agent',
      activeBufferType: 'normal',
      mouseTrackingMode: 'none',
      deltaMode: DOM_DELTA_PIXEL,
      deltaY: -120,
      carryY: 0,
      cellHeightPx: 20,
      devicePixelRatio: 2,
    });
    expect(decision).toMatchObject({ action: 'consume', scrollLines: -3 });
    expect(decision.carryY).toBeCloseTo(-0.6, 8);
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

  it('uses the local viewport for normal-buffer tmux sessions', () => {
    const decision = resolveAgentWheelPolicy({
      kind: 'agent',
      activeBufferType: 'normal',
      mouseTrackingMode: 'none',
      hostScrollMode: 'tmux',
      deltaMode: DOM_DELTA_PIXEL,
      deltaY: -120,
      carryY: 0,
      cellHeightPx: 20,
      devicePixelRatio: 2,
    });
    expect(decision).toMatchObject({ action: 'consume', scrollLines: -3 });
    expect(decision.carryY).toBeCloseTo(-0.6, 8);
  });

  it('sends alternate-buffer wheel input to the agent program so new interactive sessions can scroll', () => {
    expect(
      resolveAgentWheelPolicy({
        agentId: 'codex',
        kind: 'agent',
        activeBufferType: 'alternate',
        mouseTrackingMode: 'none',
        deltaMode: DOM_DELTA_PIXEL,
        deltaY: -800,
        carryY: 0,
        cellHeightPx: 20,
        devicePixelRatio: 2,
      })
    ).toEqual({
      action: 'program-scroll',
      carryY: 0,
      sequence: '\x1b[5~',
      repeat: 1,
    });
  });

  it('preserves Claude native mouse scrolling instead of entering tmux copy mode', () => {
    expect(
      resolveAgentWheelPolicy({
        agentId: 'claude',
        kind: 'agent',
        activeBufferType: 'alternate',
        mouseTrackingMode: 'any',
        hostScrollMode: 'tmux',
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

  it('accumulates modest alternate-buffer trackpad deltas without sending a full page', () => {
    const decision = resolveAgentWheelPolicy({
      agentId: 'codex',
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
      action: 'consume',
      scrollLines: 0,
    });
    expect(decision.carryY).toBeCloseTo(-1.2, 5);
  });

  it('accumulates small trackpad deltas with xterm-compatible partial carry', () => {
    const first = resolveAgentWheelPolicy({
      kind: 'agent',
      activeBufferType: 'normal',
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
      activeBufferType: 'normal',
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
      activeBufferType: 'normal',
      mouseTrackingMode: 'none',
      deltaMode: DOM_DELTA_PIXEL,
      deltaY: 15,
      carryY: second.carryY,
      cellHeightPx: 20,
      devicePixelRatio: 2,
    });

    expect(third).toMatchObject({
      action: 'consume',
      scrollLines: 1,
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

  it('delegates Claude alternate-buffer wheel input when mouse tracking is enabled', () => {
    expect(
      resolveAgentWheelPolicy({
        agentId: 'claude-hapi',
        kind: 'agent',
        activeBufferType: 'alternate',
        mouseTrackingMode: 'any',
        deltaMode: DOM_DELTA_LINE,
        deltaY: -3,
        carryY: 0,
        cellHeightPx: 20,
        devicePixelRatio: 2,
      })
    ).toEqual({
      action: 'delegate',
      carryY: 0,
    });
  });

  it('delegates Claude native mouse scrolling inside tmux', () => {
    expect(
      resolveAgentWheelPolicy({
        agentId: 'claude',
        kind: 'agent',
        activeBufferType: 'alternate',
        mouseTrackingMode: 'any',
        hostScrollMode: 'tmux',
        deltaMode: DOM_DELTA_LINE,
        deltaY: -4,
        carryY: 0,
        cellHeightPx: 20,
        devicePixelRatio: 2,
      })
    ).toEqual({
      action: 'delegate',
      carryY: 0,
    });
  });

  it.each([
    ['codex', -4],
    ['codex-happy', 4],
  ])('delegates %s native mouse scrolling inside tmux', (agentId, deltaY) => {
    expect(
      resolveAgentWheelPolicy({
        agentId,
        kind: 'agent',
        activeBufferType: 'alternate',
        mouseTrackingMode: 'any',
        hostScrollMode: 'tmux',
        deltaMode: DOM_DELTA_LINE,
        deltaY,
        carryY: 0,
      })
    ).toEqual({
      action: 'delegate',
      carryY: 0,
    });
  });

  it('preserves Codex normal-buffer native mouse input inside tmux', () => {
    expect(
      resolveAgentWheelPolicy({
        agentId: 'codex',
        kind: 'agent',
        activeBufferType: 'normal',
        mouseTrackingMode: 'any',
        hostScrollMode: 'tmux',
        deltaMode: DOM_DELTA_LINE,
        deltaY: -4,
        carryY: 0,
      })
    ).toEqual({
      action: 'delegate',
      carryY: 0,
    });
  });

  it('delegates normal-buffer wheel input when the program enables mouse tracking', () => {
    expect(
      resolveAgentWheelPolicy({
        kind: 'agent',
        activeBufferType: 'normal',
        mouseTrackingMode: 'any',
        deltaMode: DOM_DELTA_LINE,
        deltaY: -3,
        carryY: 0,
        cellHeightPx: 20,
        devicePixelRatio: 2,
      })
    ).toEqual({
      action: 'delegate',
      carryY: 0,
    });
  });

  it('delegates wheel input to a mouse-tracking agent even when the process is hosted by tmux', () => {
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
