import { describe, expect, it } from 'vitest';
import {
  isSidebarHoverRevealTextSelectionActive,
  resolveSidebarHoverRevealFrame,
  resolveSidebarHoverRevealPointerActiveState,
  SIDEBAR_HOVER_REVEAL_FLOATING_GAP,
  SIDEBAR_HOVER_REVEAL_TRIGGER_WIDTH,
  shouldCloseSidebarHoverRevealAfterFocusChange,
  shouldOpenSidebarHoverReveal,
  shouldSyncSidebarHoverRevealAfterWindowFocus,
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

  it('does not open from pointer hover while the user is dragging or selecting text', () => {
    expect(
      shouldOpenSidebarHoverReveal({
        documentFocused: true,
        hasActiveTextSelection: false,
        pointerButtons: 1,
        trigger: 'pointer',
      })
    ).toBe(false);
    expect(
      shouldOpenSidebarHoverReveal({
        documentFocused: true,
        hasActiveTextSelection: true,
        pointerButtons: 0,
        trigger: 'pointer',
      })
    ).toBe(false);
  });

  it('keeps an already open reveal active during pointer-pressed content interactions', () => {
    expect(
      resolveSidebarHoverRevealPointerActiveState({
        currentActive: true,
        documentFocused: true,
        hasActiveTextSelection: true,
        pointerButtons: 1,
      })
    ).toBe(true);
    expect(
      resolveSidebarHoverRevealPointerActiveState({
        currentActive: false,
        documentFocused: true,
        hasActiveTextSelection: true,
        pointerButtons: 1,
      })
    ).toBe(false);
  });

  it('keeps keyboard focus reveal available when text remains selected', () => {
    expect(
      shouldOpenSidebarHoverReveal({
        documentFocused: true,
        focusVisible: true,
        hasActiveTextSelection: true,
        pointerButtons: 0,
        trigger: 'keyboard',
      })
    ).toBe(true);
  });

  it('does not open after pointer-driven dialog focus restoration', () => {
    expect(
      shouldOpenSidebarHoverReveal({
        documentFocused: true,
        focusVisible: false,
        hasActiveTextSelection: false,
        pointerButtons: 0,
        trigger: 'keyboard',
      })
    ).toBe(false);
  });

  it('keeps an open reveal active when a pointer interaction focuses a sidebar control', () => {
    expect(
      shouldOpenSidebarHoverReveal({
        currentActive: true,
        documentFocused: true,
        focusVisible: false,
        hasActiveTextSelection: false,
        pointerButtons: 0,
        trigger: 'keyboard',
      })
    ).toBe(true);
  });

  it('keeps the reveal open when focus blurs to non-focusable content under the pointer', () => {
    expect(
      shouldCloseSidebarHoverRevealAfterFocusChange({
        groupHovered: true,
        nextFocusInside: false,
      })
    ).toBe(false);
    expect(
      shouldCloseSidebarHoverRevealAfterFocusChange({
        groupHovered: false,
        nextFocusInside: true,
      })
    ).toBe(false);
    expect(
      shouldCloseSidebarHoverRevealAfterFocusChange({
        groupHovered: false,
        nextFocusInside: false,
        nextFocusManagedBySidebar: true,
      })
    ).toBe(false);
    expect(
      shouldCloseSidebarHoverRevealAfterFocusChange({
        groupHovered: false,
        nextFocusInside: false,
      })
    ).toBe(true);
  });

  it('resyncs hover reveal after window focus only when the pointer is already over the rail', () => {
    expect(
      shouldSyncSidebarHoverRevealAfterWindowFocus({
        documentFocused: true,
        groupHovered: true,
        hasActiveTextSelection: false,
      })
    ).toBe(true);
    expect(
      shouldSyncSidebarHoverRevealAfterWindowFocus({
        documentFocused: true,
        groupHovered: true,
        hasActiveTextSelection: true,
      })
    ).toBe(false);
    expect(
      shouldSyncSidebarHoverRevealAfterWindowFocus({
        documentFocused: false,
        groupHovered: true,
        hasActiveTextSelection: false,
      })
    ).toBe(false);
  });

  it('detects meaningful native text selections', () => {
    expect(isSidebarHoverRevealTextSelectionActive(null)).toBe(false);
    expect(
      isSidebarHoverRevealTextSelectionActive({
        isCollapsed: false,
        toString: () => '  ',
      })
    ).toBe(false);
    expect(
      isSidebarHoverRevealTextSelectionActive({
        isCollapsed: false,
        toString: () => 'selected text',
      })
    ).toBe(true);
  });
});
