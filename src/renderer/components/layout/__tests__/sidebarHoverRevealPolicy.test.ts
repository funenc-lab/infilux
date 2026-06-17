import { describe, expect, it } from 'vitest';
import {
  resolveSidebarHoverRevealFrame,
  SIDEBAR_HOVER_REVEAL_FLOATING_GAP,
  SIDEBAR_HOVER_REVEAL_TRIGGER_WIDTH,
} from '../sidebarHoverRevealPolicy';

describe('resolveSidebarHoverRevealFrame', () => {
  it('uses a small visual gap for floating sidebars without changing layout width', () => {
    expect(SIDEBAR_HOVER_REVEAL_FLOATING_GAP).toBe(6);
  });

  it('auto-hides the full sidebar when hover reveal is enabled and inactive', () => {
    expect(
      resolveSidebarHoverRevealFrame({
        collapsed: false,
        hoverRevealActive: false,
        hoverRevealEnabled: true,
        expandedWidth: 320,
        collapsedWidth: 44,
      })
    ).toEqual({
      layoutWidth: 0,
      trackWidth: SIDEBAR_HOVER_REVEAL_TRIGGER_WIDTH,
      triggerWidth: SIDEBAR_HOVER_REVEAL_TRIGGER_WIDTH,
      panelWidth: 320,
      floating: true,
      visible: false,
    });
  });

  it('keeps the fixed collapsed rail width when hover reveal is disabled', () => {
    expect(
      resolveSidebarHoverRevealFrame({
        collapsed: true,
        hoverRevealActive: false,
        hoverRevealEnabled: false,
        expandedWidth: 320,
        collapsedWidth: 44,
      })
    ).toEqual({
      layoutWidth: 44,
      trackWidth: 44,
      triggerWidth: 44,
      panelWidth: 44,
      floating: false,
      visible: true,
    });
  });

  it('expands only the floating overlay track while hover reveal is active', () => {
    expect(
      resolveSidebarHoverRevealFrame({
        collapsed: true,
        hoverRevealActive: true,
        hoverRevealEnabled: true,
        expandedWidth: 320,
        collapsedWidth: 44,
      })
    ).toEqual({
      layoutWidth: 0,
      trackWidth: 320,
      triggerWidth: SIDEBAR_HOVER_REVEAL_TRIGGER_WIDTH,
      panelWidth: 320,
      floating: true,
      visible: true,
    });
  });
});
