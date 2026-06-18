import { describe, expect, it } from 'vitest';
import {
  FLOATING_TOOLBAR_FLOATING_GAP,
  FLOATING_TOOLBAR_PANEL_WIDTH,
  FLOATING_TOOLBAR_TRIGGER_WIDTH,
  resolveFloatingToolbarRevealFrame,
} from '../floatingToolbarRevealPolicy';

describe('floating toolbar reveal policy', () => {
  it('keeps the normal topbar in layout flow when floating toolbar mode is disabled', () => {
    expect(
      resolveFloatingToolbarRevealFrame({
        floatingToolbarEnabled: false,
      })
    ).toEqual({
      layoutHeight: 'auto',
      floating: false,
      triggerWidth: 0,
      panelWidth: 0,
      floatingGap: 0,
    });
  });

  it('removes the toolbar from normal layout flow and keeps a right-edge trigger when enabled', () => {
    expect(
      resolveFloatingToolbarRevealFrame({
        floatingToolbarEnabled: true,
      })
    ).toEqual({
      layoutHeight: 0,
      floating: true,
      triggerWidth: FLOATING_TOOLBAR_TRIGGER_WIDTH,
      panelWidth: FLOATING_TOOLBAR_PANEL_WIDTH,
      floatingGap: FLOATING_TOOLBAR_FLOATING_GAP,
    });
  });
});
