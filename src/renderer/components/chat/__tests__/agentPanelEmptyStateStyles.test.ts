import { describe, expect, it } from 'vitest';
import { agentPanelSource } from './agentPanelSource';

const panelSource = agentPanelSource;

describe('AgentPanel empty state styles', () => {
  it('centers the empty state card within the agent panel surface', () => {
    expect(panelSource).toContain(
      'absolute inset-0 z-20 flex items-start justify-center px-6 pb-6 pt-24 sm:pt-28'
    );
    expect(panelSource).toContain('className="mx-auto max-w-[min(48rem,100%)]"');
  });

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
    expect(panelSource).toContain('flex w-full min-w-0 items-stretch overflow-hidden rounded-xl');
    expect(panelSource).toContain('EMPTY_STATE_SPLIT_ACTION_TOGGLE_CLASS_NAME');
  });

  it('gives the primary action stronger hierarchy with a stacked label block and responsive action layout', () => {
    expect(panelSource).toContain(
      'flex w-full flex-col items-stretch justify-center gap-3 sm:flex-row sm:flex-wrap sm:items-stretch sm:justify-center'
    );
    expect(panelSource).toContain(
      'min-h-[3.75rem] flex-1 justify-start gap-3.5 px-5 py-3 text-left whitespace-normal'
    );
    expect(panelSource).toContain('flex min-w-0 flex-1 flex-col items-start gap-1');
    expect(panelSource).toContain('text-xs leading-none text-primary-foreground/78');
  });

  it('keeps the primary launch control visually balanced instead of stretching across the row', () => {
    expect(panelSource).toContain('relative flex w-full items-stretch justify-center sm:w-auto');
    expect(panelSource).toContain(
      "emptyStateModel.showProfilePicker\n                      ? 'flex-1 rounded-r-none pr-4 sm:min-w-[18rem] sm:flex-none'"
    );
    expect(panelSource).toContain(": 'min-w-[16rem] sm:min-w-[18rem]'");
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
