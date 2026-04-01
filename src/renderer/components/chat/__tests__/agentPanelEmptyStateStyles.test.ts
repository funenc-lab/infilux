import { describe, expect, it } from 'vitest';
import { agentPanelSource } from './agentPanelSource';

const panelSource = agentPanelSource;

describe('AgentPanel empty state styles', () => {
  it('uses shared console action button classes for the empty state controls', () => {
    expect(panelSource).toContain('control-action-button');
    expect(panelSource).toContain('control-action-button-primary');
    expect(panelSource).toContain('control-action-button-secondary');
  });

  it('uses themed button variants for the empty state actions', () => {
    expect(panelSource).toMatch(/<Button[\s\S]*?variant="default"/m);
    expect(panelSource).toMatch(/<Button[\s\S]*?variant="outline"/m);
  });

  it('uses the shared console menu item class for profile options', () => {
    expect(panelSource).toContain('control-menu-item');
  });

  it('merges the default launch action and profile picker into a split control', () => {
    expect(panelSource).toContain('flex min-w-0 items-stretch overflow-hidden rounded-xl');
    expect(panelSource).toContain("emptyStateModel.showProfilePicker ? 'rounded-r-none pr-4'");
    expect(panelSource).toContain('EMPTY_STATE_SPLIT_ACTION_TOGGLE_CLASS_NAME');
  });

  it('gives the primary action stronger hierarchy with a stacked label block and responsive action layout', () => {
    expect(panelSource).toContain(
      'flex w-full flex-col items-stretch gap-3 sm:w-auto sm:flex-row sm:flex-wrap sm:items-stretch'
    );
    expect(panelSource).toContain('min-h-12 flex-1 justify-start gap-3 px-4 py-2 text-left');
    expect(panelSource).toContain('flex min-w-0 flex-1 flex-col items-start gap-1');
    expect(panelSource).toContain('text-xs leading-none text-primary-foreground/78');
  });

  it('anchors the profile menu to the action group with responsive width handling', () => {
    expect(panelSource).toContain(
      'absolute left-0 right-0 top-full z-50 pt-2 text-left sm:left-auto sm:right-0 sm:min-w-52'
    );
  });

  it('keeps the profile picker header label shrink-safe beside the settings button', () => {
    expect(panelSource).toContain('mb-1 flex min-w-0 items-center justify-between gap-2 px-1 py-1');
    expect(panelSource).toContain('control-menu-label min-w-0 flex-1 truncate pr-2');
  });
});
