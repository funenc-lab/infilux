export const SIDEBAR_HOVER_REVEAL_TRIGGER_WIDTH = 10;
export const SIDEBAR_HOVER_REVEAL_FLOATING_GAP = 6;

type SidebarHoverRevealTrigger = 'keyboard' | 'pointer';

interface SidebarHoverRevealTextSelectionLike {
  isCollapsed: boolean;
  toString(): string;
}

interface SidebarHoverRevealFrameInput {
  collapsed: boolean;
  hoverRevealActive: boolean;
  hoverRevealEnabled: boolean;
  expandedWidth: number;
  collapsedWidth: number;
}

export interface SidebarHoverRevealFrame {
  layoutWidth: number;
  trackWidth: number;
  triggerWidth: number;
  panelWidth: number;
  floating: boolean;
  visible: boolean;
}

interface SidebarHoverRevealOpenInput {
  documentFocused: boolean;
  hasActiveTextSelection: boolean;
  pointerButtons: number;
  trigger: SidebarHoverRevealTrigger;
}

interface SidebarHoverRevealPointerActiveInput {
  currentActive: boolean;
  documentFocused: boolean;
  hasActiveTextSelection: boolean;
  pointerButtons: number;
}

interface SidebarHoverRevealFocusChangeInput {
  groupHovered: boolean;
  nextFocusInside: boolean;
}

interface SidebarHoverRevealWindowFocusInput {
  documentFocused: boolean;
  groupHovered: boolean;
  hasActiveTextSelection: boolean;
}

export function resolveSidebarHoverRevealFrame({
  collapsed,
  hoverRevealActive,
  hoverRevealEnabled,
  expandedWidth,
  collapsedWidth,
}: SidebarHoverRevealFrameInput): SidebarHoverRevealFrame {
  if (hoverRevealEnabled) {
    return {
      layoutWidth: 0,
      trackWidth: hoverRevealActive ? expandedWidth : SIDEBAR_HOVER_REVEAL_TRIGGER_WIDTH,
      triggerWidth: SIDEBAR_HOVER_REVEAL_TRIGGER_WIDTH,
      panelWidth: expandedWidth,
      floating: true,
      visible: hoverRevealActive,
    };
  }

  if (!collapsed) {
    return {
      layoutWidth: expandedWidth,
      trackWidth: expandedWidth,
      triggerWidth: expandedWidth,
      panelWidth: expandedWidth,
      floating: false,
      visible: true,
    };
  }

  return {
    layoutWidth: collapsedWidth,
    trackWidth: collapsedWidth,
    triggerWidth: collapsedWidth,
    panelWidth: collapsedWidth,
    floating: false,
    visible: true,
  };
}

export function isSidebarHoverRevealTextSelectionActive(
  selection: SidebarHoverRevealTextSelectionLike | null | undefined
): boolean {
  if (!selection || selection.isCollapsed) {
    return false;
  }

  return selection.toString().trim().length > 0;
}

export function shouldOpenSidebarHoverReveal({
  documentFocused,
  hasActiveTextSelection,
  pointerButtons,
  trigger,
}: SidebarHoverRevealOpenInput): boolean {
  if (trigger === 'keyboard') {
    return documentFocused;
  }

  if (!documentFocused || pointerButtons !== 0) {
    return false;
  }

  return !hasActiveTextSelection;
}

export function resolveSidebarHoverRevealPointerActiveState({
  currentActive,
  documentFocused,
  hasActiveTextSelection,
  pointerButtons,
}: SidebarHoverRevealPointerActiveInput): boolean {
  if (!documentFocused) {
    return false;
  }

  if (currentActive) {
    return true;
  }

  return pointerButtons === 0 && !hasActiveTextSelection;
}

export function shouldCloseSidebarHoverRevealAfterFocusChange({
  groupHovered,
  nextFocusInside,
}: SidebarHoverRevealFocusChangeInput): boolean {
  return !nextFocusInside && !groupHovered;
}

export function shouldSyncSidebarHoverRevealAfterWindowFocus({
  documentFocused,
  groupHovered,
  hasActiveTextSelection,
}: SidebarHoverRevealWindowFocusInput): boolean {
  return documentFocused && groupHovered && !hasActiveTextSelection;
}
