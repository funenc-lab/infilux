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

interface SidebarHoverRevealOpenBaseInput {
  currentActive?: boolean;
  documentFocused: boolean;
  hasActiveTextSelection: boolean;
  pointerButtons: number;
}

type SidebarHoverRevealOpenInput = SidebarHoverRevealOpenBaseInput &
  (
    | { trigger: Extract<SidebarHoverRevealTrigger, 'keyboard'>; focusVisible: boolean }
    | { trigger: Extract<SidebarHoverRevealTrigger, 'pointer'> }
  );

interface SidebarHoverRevealPointerActiveInput {
  currentActive: boolean;
  documentFocused: boolean;
  hasActiveTextSelection: boolean;
  pointerButtons: number;
}

interface SidebarHoverRevealFocusChangeInput {
  groupHovered: boolean;
  nextFocusInside: boolean;
  nextFocusManagedBySidebar?: boolean;
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

export function shouldOpenSidebarHoverReveal(input: SidebarHoverRevealOpenInput): boolean {
  if (input.currentActive) {
    return true;
  }

  if (input.trigger === 'keyboard') {
    return input.documentFocused && input.focusVisible;
  }

  if (!input.documentFocused || input.pointerButtons !== 0) {
    return false;
  }

  return !input.hasActiveTextSelection;
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
  nextFocusManagedBySidebar = false,
}: SidebarHoverRevealFocusChangeInput): boolean {
  return !nextFocusInside && !nextFocusManagedBySidebar && !groupHovered;
}

export function shouldSyncSidebarHoverRevealAfterWindowFocus({
  documentFocused,
  groupHovered,
  hasActiveTextSelection,
}: SidebarHoverRevealWindowFocusInput): boolean {
  return documentFocused && groupHovered && !hasActiveTextSelection;
}
