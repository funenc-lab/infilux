export const FLOATING_TOOLBAR_TRIGGER_WIDTH = 10;
export const FLOATING_TOOLBAR_PANEL_WIDTH = 52;
export const FLOATING_TOOLBAR_FLOATING_GAP = 6;

interface FloatingToolbarRevealFrameInput {
  floatingToolbarEnabled: boolean;
}

export interface FloatingToolbarRevealFrame {
  layoutHeight: 'auto' | 0;
  floating: boolean;
  triggerWidth: number;
  panelWidth: number;
  floatingGap: number;
}

export function resolveFloatingToolbarRevealFrame({
  floatingToolbarEnabled,
}: FloatingToolbarRevealFrameInput): FloatingToolbarRevealFrame {
  if (!floatingToolbarEnabled) {
    return {
      layoutHeight: 'auto',
      floating: false,
      triggerWidth: 0,
      panelWidth: 0,
      floatingGap: 0,
    };
  }

  return {
    layoutHeight: 0,
    floating: true,
    triggerWidth: FLOATING_TOOLBAR_TRIGGER_WIDTH,
    panelWidth: FLOATING_TOOLBAR_PANEL_WIDTH,
    floatingGap: FLOATING_TOOLBAR_FLOATING_GAP,
  };
}
