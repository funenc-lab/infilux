import { describe, expect, it } from 'vitest';

describe('agent canvas viewport helpers', () => {
  it('clamps zoom values into the supported range', async () => {
    const module = await import('../agentCanvasViewport').catch(() => null);

    expect(module?.clampAgentCanvasZoom(0.03)).toBe(0.1);
    expect(module?.clampAgentCanvasZoom(0.3)).toBe(0.3);
    expect(module?.clampAgentCanvasZoom(1)).toBe(1);
    expect(module?.clampAgentCanvasZoom(2)).toBe(2);
    expect(module?.clampAgentCanvasZoom(5)).toBe(4);
  });

  it('steps zoom in fixed increments and formats the percentage label', async () => {
    const module = await import('../agentCanvasViewport').catch(() => null);

    expect(module?.stepAgentCanvasZoom(1, 'in')).toBe(1.1);
    expect(module?.stepAgentCanvasZoom(1, 'out')).toBe(0.9);
    expect(module?.stepAgentCanvasZoom(0.1, 'out')).toBe(0.1);
    expect(module?.stepAgentCanvasZoomByDelta(1, -3)).toBe(0.7);
    expect(module?.stepAgentCanvasZoomByDelta(1, 4)).toBe(1.4);
    expect(module?.formatAgentCanvasZoomPercent(4)).toBe('400%');
  });

  it('accumulates wheel delta into batched zoom steps with remainder retention', async () => {
    const module = await import('../agentCanvasViewport').catch(() => null);

    expect(module?.resolveAgentCanvasWheelZoomDelta(10)).toEqual({
      nextPendingDelta: 10,
      stepDelta: 0,
    });
    expect(module?.resolveAgentCanvasWheelZoomDelta(44)).toEqual({
      nextPendingDelta: 0,
      stepDelta: -1,
    });
    expect(module?.resolveAgentCanvasWheelZoomDelta(-88)).toEqual({
      nextPendingDelta: 0,
      stepDelta: 2,
    });
    expect(module?.resolveAgentCanvasWheelZoomDelta(73)).toEqual({
      nextPendingDelta: 29,
      stepDelta: -1,
    });
    expect(module?.resolveAgentCanvasWheelZoomDelta(-73)).toEqual({
      nextPendingDelta: -29,
      stepDelta: 1,
    });
  });

  it('resolves a centered virtual plane so zooming out leaves draggable blank space', async () => {
    const module = await import('../agentCanvasViewport').catch(() => null);

    expect(module?.resolveAgentCanvasViewportMetrics(0.8)).toEqual({
      framePercent: expect.closeTo(11.111111, 5),
      planePercent: 900,
      zoom: 0.8,
    });
    expect(module?.resolveAgentCanvasViewportMetrics(1.4)).toEqual({
      framePercent: expect.closeTo(11.111111, 5),
      planePercent: 900,
      zoom: 1.4,
    });
  });

  it('centers the viewport within the virtual plane', async () => {
    const module = await import('../agentCanvasViewport').catch(() => null);

    expect(
      module?.resolveAgentCanvasCenteredScrollPosition({
        clientHeight: 100,
        clientWidth: 100,
        scrollHeight: 900,
        scrollWidth: 900,
      })
    ).toEqual({
      left: 400,
      top: 400,
    });
  });

  it('clamps a scroll position into the current viewport bounds', async () => {
    const module = await import('../agentCanvasViewport').catch(() => null);

    expect(
      module?.clampAgentCanvasScrollPosition({
        clientHeight: 180,
        clientWidth: 240,
        left: -64,
        scrollHeight: 960,
        scrollWidth: 1040,
        top: 1200,
      })
    ).toEqual({
      left: 0,
      top: 780,
    });
  });

  it('restores a saved viewport position and falls back to the centered position', async () => {
    const module = await import('../agentCanvasViewport').catch(() => null);

    expect(
      module?.resolveAgentCanvasRestoreScrollPosition({
        clientHeight: 180,
        clientWidth: 220,
        savedPosition: {
          left: 640,
          top: 920,
        },
        scrollHeight: 920,
        scrollWidth: 960,
      })
    ).toEqual({
      left: 640,
      top: 740,
    });

    expect(
      module?.resolveAgentCanvasRestoreScrollPosition({
        clientHeight: 180,
        clientWidth: 220,
        savedPosition: null,
        scrollHeight: 920,
        scrollWidth: 960,
      })
    ).toEqual({
      left: 370,
      top: 370,
    });
  });

  it('prefers the centered position when a worktree switch explicitly requests recentering', async () => {
    const module = await import('../agentCanvasViewport').catch(() => null);

    expect(
      module?.resolveAgentCanvasRestoreScrollPosition({
        clientHeight: 180,
        clientWidth: 220,
        savedPosition: {
          left: 640,
          top: 920,
        },
        scrollHeight: 920,
        scrollWidth: 960,
        ...{ forceCenter: true },
      })
    ).toEqual({
      left: 370,
      top: 370,
    });
  });

  it('detects whether the current scroll position is still near the viewport center', async () => {
    const module = await import('../agentCanvasViewport').catch(() => null);

    expect(
      module?.isAgentCanvasScrollPositionNearCenter({
        clientHeight: 120,
        clientWidth: 160,
        currentLeft: 372,
        currentTop: 388,
        scrollHeight: 920,
        scrollWidth: 960,
      })
    ).toBe(true);

    expect(
      module?.isAgentCanvasScrollPositionNearCenter({
        clientHeight: 120,
        clientWidth: 160,
        currentLeft: 240,
        currentTop: 220,
        scrollHeight: 920,
        scrollWidth: 960,
      })
    ).toBe(false);
  });

  it('recenters on resize only when the current view is still near the previous center', async () => {
    const module = await import('../agentCanvasViewport').catch(() => null);

    expect(
      module?.resolveAgentCanvasResizeScrollPosition({
        currentLeft: 372,
        currentTop: 388,
        nextClientHeight: 180,
        nextClientWidth: 220,
        nextScrollHeight: 920,
        nextScrollWidth: 960,
        previousClientHeight: 120,
        previousClientWidth: 160,
        previousScrollHeight: 920,
        previousScrollWidth: 960,
      })
    ).toEqual({
      left: 370,
      top: 370,
    });

    expect(
      module?.resolveAgentCanvasResizeScrollPosition({
        currentLeft: 240,
        currentTop: 220,
        nextClientHeight: 840,
        nextClientWidth: 900,
        nextScrollHeight: 920,
        nextScrollWidth: 960,
        previousClientHeight: 120,
        previousClientWidth: 160,
        previousScrollHeight: 920,
        previousScrollWidth: 960,
      })
    ).toEqual({
      left: 60,
      top: 80,
    });
  });

  it('prioritizes the focused session tile when resize changes the viewport layout', async () => {
    const module = await import('../agentCanvasViewport').catch(() => null);

    expect(
      module?.resolveAgentCanvasViewportSyncPosition({
        currentLeft: 120,
        currentTop: 180,
        focusTarget: {
          height: 240,
          left: 820,
          top: 640,
          width: 360,
        },
        nextClientHeight: 200,
        nextClientWidth: 300,
        nextScrollHeight: 1200,
        nextScrollWidth: 1500,
        previousSnapshot: {
          clientHeight: 120,
          clientWidth: 160,
          scrollHeight: 1200,
          scrollWidth: 1500,
        },
        savedPosition: {
          left: 40,
          top: 60,
        },
      })
    ).toEqual({
      left: 850,
      top: 660,
    });
  });

  it('prioritizes the focused session tile when zoom changes the rendered layout', async () => {
    const module = await import('../agentCanvasViewport').catch(() => null);

    expect(
      module?.resolveAgentCanvasZoomScrollPosition({
        clientHeight: 220,
        clientWidth: 320,
        currentLeft: 180,
        currentTop: 260,
        focusTarget: {
          height: 280,
          left: 860,
          top: 700,
          width: 420,
        },
        scrollHeight: 1500,
        scrollWidth: 1800,
      })
    ).toEqual({
      left: 910,
      top: 730,
    });
  });

  it('keeps the current viewport position clamped when zoom changes without a focus target', async () => {
    const module = await import('../agentCanvasViewport').catch(() => null);

    expect(
      module?.resolveAgentCanvasZoomScrollPosition({
        clientHeight: 240,
        clientWidth: 320,
        currentLeft: -30,
        currentTop: 1480,
        focusTarget: null,
        scrollHeight: 1600,
        scrollWidth: 1500,
      })
    ).toEqual({
      left: 0,
      top: 1360,
    });
  });

  it('recenters the first viewport sync for a new worktree instead of preserving stale scroll', async () => {
    const module = await import('../agentCanvasViewport').catch(() => null);

    expect(
      module?.resolveAgentCanvasViewportSyncPosition({
        currentLeft: 120,
        currentTop: 180,
        nextClientHeight: 180,
        nextClientWidth: 220,
        nextScrollHeight: 920,
        nextScrollWidth: 960,
        previousSnapshot: null,
        savedPosition: null,
      })
    ).toEqual({
      left: 370,
      top: 370,
    });
  });

  it('restores a saved viewport position during the first sync for a revisited worktree', async () => {
    const module = await import('../agentCanvasViewport').catch(() => null);

    expect(
      module?.resolveAgentCanvasViewportSyncPosition({
        currentLeft: 120,
        currentTop: 180,
        nextClientHeight: 180,
        nextClientWidth: 220,
        nextScrollHeight: 920,
        nextScrollWidth: 960,
        previousSnapshot: null,
        savedPosition: {
          left: 640,
          top: 920,
        },
      })
    ).toEqual({
      left: 640,
      top: 740,
    });
  });

  it('resolves a clamped focus scroll position for a target tile', async () => {
    const module = await import('../agentCanvasViewport').catch(() => null);

    expect(
      module?.resolveAgentCanvasFocusScrollPosition({
        clientHeight: 200,
        clientWidth: 300,
        currentScrollLeft: 400,
        currentScrollTop: 300,
        scrollHeight: 1200,
        scrollWidth: 1500,
        targetHeight: 240,
        targetLeft: 820,
        targetTop: 640,
        targetWidth: 360,
      })
    ).toEqual({
      left: 850,
      top: 660,
    });

    expect(
      module?.resolveAgentCanvasFocusScrollPosition({
        clientHeight: 200,
        clientWidth: 300,
        currentScrollLeft: 40,
        currentScrollTop: 20,
        scrollHeight: 600,
        scrollWidth: 700,
        targetHeight: 120,
        targetLeft: 10,
        targetTop: 5,
        targetWidth: 100,
      })
    ).toEqual({
      left: 0,
      top: 0,
    });
  });

  it('prefers smooth focus scrolling unless reduced motion is requested', async () => {
    const module = await import('../agentCanvasViewport').catch(() => null);

    expect(module?.resolveAgentCanvasScrollBehavior(false)).toBe('smooth');
    expect(module?.resolveAgentCanvasScrollBehavior(true)).toBe('auto');
  });

  it('resolves a focus zoom that makes the target occupy 80% of the viewport without shrinking', async () => {
    const module = await import('../agentCanvasViewport').catch(() => null);

    expect(
      module?.resolveAgentCanvasFocusZoom({
        currentZoom: 0.8,
        targetHeight: 180,
        targetWidth: 240,
        viewportHeight: 800,
        viewportWidth: 1000,
      })
    ).toBe(2.67);

    expect(
      module?.resolveAgentCanvasFocusZoom({
        currentZoom: 2.4,
        targetHeight: 720,
        targetWidth: 880,
        viewportHeight: 800,
        viewportWidth: 1000,
      })
    ).toBe(2.4);
  });

  it('resolves a centered floating frame that occupies 80% of the viewport', async () => {
    const module = await import('../agentCanvasViewport').catch(() => null);

    expect(
      module?.resolveAgentCanvasFloatingFrame({
        viewportHeight: 900,
        viewportLeft: 100,
        viewportTop: 60,
        viewportWidth: 1200,
      })
    ).toEqual({
      height: 720,
      left: 220,
      top: 150,
      width: 960,
    });
  });

  it('resolves a dynamic terminal font scale from the floating frame size', async () => {
    const module = await import('../agentCanvasViewport').catch(() => null);

    expect(
      module?.resolveAgentCanvasFloatingTerminalFontScale({
        frameHeight: 720,
        frameWidth: 960,
      })
    ).toBeCloseTo(1.33, 2);

    expect(
      module?.resolveAgentCanvasFloatingTerminalFontScale({
        frameHeight: 420,
        frameWidth: 560,
      })
    ).toBeCloseTo(0.9, 2);

    expect(
      module?.resolveAgentCanvasFloatingTerminalFontScale({
        frameHeight: 1200,
        frameWidth: 1600,
      })
    ).toBeCloseTo(1.6, 2);
  });

  it('resolves a zoom-driven terminal font scale with quantized perceptual steps', async () => {
    const module = await import('../agentCanvasViewport').catch(() => null);

    expect(module?.resolveAgentCanvasZoomTerminalFontScale(0.2)).toBe(0.85);
    expect(module?.resolveAgentCanvasZoomTerminalFontScale(1)).toBe(1);
    expect(module?.resolveAgentCanvasZoomTerminalFontScale(1.6)).toBe(1.1);
    expect(module?.resolveAgentCanvasZoomTerminalFontScale(4)).toBe(1.25);
  });
});
