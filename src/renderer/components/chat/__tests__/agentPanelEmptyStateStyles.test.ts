import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { agentPanelSource } from './agentPanelSource';

const currentDir = dirname(fileURLToPath(import.meta.url));
const globalsSource = readFileSync(resolve(currentDir, '../../../styles/globals.css'), 'utf8');
const panelSource = agentPanelSource;

describe('AgentPanel empty state styles', () => {
  it('renders the main agent empty state as a control-state card instead of a generic console card', () => {
    expect(panelSource).toContain('<ControlStateCard');
    expect(panelSource).not.toContain('<ConsoleEmptyState');
    expect(panelSource).toContain("eyebrow={t('Agent Console')}");
  });

  it('allows the profile picker menu to escape the card without being clipped', () => {
    expect(panelSource).toContain('cardClassName="max-w-[min(54rem,100%)] overflow-visible"');
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

  it('keeps the primary action on the shared control-state button density instead of a hero CTA', () => {
    expect(panelSource).toContain('ControlStateActionButton');
    expect(panelSource).toContain(
      'flex w-full flex-col items-stretch gap-3 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center'
    );
    expect(panelSource).toContain('w-full justify-start gap-2.5');
    expect(panelSource).toContain('min-w-0 flex-1 truncate');
    expect(panelSource).not.toContain('min-h-[3.75rem]');
    expect(panelSource).not.toContain('flex min-w-0 flex-1 flex-col items-start gap-1');
    expect(panelSource).not.toContain(
      'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-foreground/6 ring-1 ring-foreground/10'
    );
    expect(panelSource).not.toContain('text-xs leading-none text-foreground/70');
  });

  it('uses a single next-step meta line instead of path chips and compact detail tiles', () => {
    expect(panelSource).toContain("metaLabel={t('Next Step')}");
    expect(panelSource).toContain('metaValue={emptyStateModel.nextStepLabel}');
    expect(panelSource).not.toContain('detailsLayout="compact"');
    expect(panelSource).not.toContain('getDisplayPathBasename(cwd)');
    expect(panelSource).not.toContain("label: t('Status'), value: emptyStateModel.statusLabel");
  });

  it('moves supporting status context into a quieter footer row', () => {
    expect(panelSource).toContain('text-[0.76em] leading-5 text-muted-foreground/84');
    expect(panelSource).toContain("{t('Status')}");
    expect(panelSource).toContain("{t('Default Agent')}");
  });

  it('keeps default-agent status out of the primary button label to avoid badge overflow', () => {
    expect(panelSource).not.toContain('EMPTY_STATE_PRIMARY_ACTION_META_BADGE_CLASS_NAME');
    expect(panelSource).toContain("{t('Default Agent')}");
  });

  it('keeps the split toggle on the same primary control surface as the launch button', () => {
    expect(panelSource).toContain('CHAT_ACTION_BUTTON_PRIMARY_CLASS_NAME');
    expect(panelSource).toContain('rounded-l-none border-l border-foreground/12 px-3');
    expect(panelSource).not.toContain('hover:brightness-110');
  });

  it('keeps the agent profiles action on the standard secondary button pattern', () => {
    expect(panelSource).toContain('CHAT_ACTION_BUTTON_SECONDARY_CLASS_NAME');
    expect(panelSource).toContain(
      'w-full justify-start gap-2.5 rounded-xl px-4 text-[15px] font-medium sm:w-auto sm:min-w-[11rem]'
    );
    expect(panelSource).toContain('<Settings className="h-4 w-4 text-muted-foreground" />');
    expect(panelSource).not.toContain(
      'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-foreground/5 text-foreground ring-1 ring-border/60'
    );
  });

  it('keeps the primary launch control visually balanced instead of stretching across the row', () => {
    expect(panelSource).toContain('relative flex w-full min-w-0 items-stretch sm:w-auto');
    expect(panelSource).toContain(
      "emptyStateModel.showProfilePicker\n                      ? 'w-full justify-start gap-2.5 rounded-r-none pr-3 sm:w-auto sm:min-w-[16rem]'"
    );
    expect(panelSource).toContain(": 'w-full justify-start gap-2.5 sm:w-auto sm:min-w-[16rem]'");
  });

  it('anchors the profile menu to the action group with responsive width handling', () => {
    expect(panelSource).toContain(
      'absolute left-0 right-0 top-full z-50 pt-2 text-left sm:left-auto sm:right-0 sm:min-w-52'
    );
  });

  it('defines dark control-family surfaces for the shared empty-state action buttons', () => {
    expect(globalsSource).toContain('.control-action-button {');
    expect(globalsSource).toContain('background-color 140ms ease,');
    expect(globalsSource).toContain('border-color 140ms ease,');
    expect(globalsSource).toContain('.control-action-button-primary {');
    expect(globalsSource).toContain(
      'background: color-mix(in oklch, var(--primary) 16%, var(--background) 84%);'
    );
    expect(globalsSource).toContain(
      'border-color: color-mix(in oklch, var(--primary) 28%, var(--border) 72%);'
    );
    expect(globalsSource).toContain('color: var(--foreground);');
    expect(globalsSource).toContain('.control-action-button-secondary {');
    expect(globalsSource).toContain(
      'background: color-mix(in oklch, var(--background) 92%, var(--muted) 8%);'
    );
    expect(globalsSource).toContain(
      'border-color: color-mix(in oklch, var(--border) 84%, transparent);'
    );
    expect(globalsSource).toContain('.control-action-button:active {');
    expect(globalsSource).toContain('transform: none;');
    expect(globalsSource).not.toContain(
      '.control-action-button-primary {\n    border-color: color-mix(in oklch, var(--primary) 28%, var(--border) 72%);\n    background: linear-gradient('
    );
  });

  it('keeps the profile picker header label shrink-safe beside the settings button', () => {
    expect(panelSource).toContain('mb-1 flex min-w-0 items-center justify-between gap-2 px-1 py-1');
    expect(panelSource).toContain('control-menu-label min-w-0 flex-1 truncate pr-2');
  });

  it('reuses shared chat control button helpers instead of owning every button class locally', () => {
    expect(panelSource).toContain("from '../controlButtonStyles'");
    expect(panelSource).toContain('CHAT_ACTION_BUTTON_SECONDARY_CLASS_NAME');
    expect(panelSource).toContain('CHAT_MENU_ICON_BUTTON_CLASS_NAME');
    expect(panelSource).toContain('CHAT_MENU_ITEM_BASE_CLASS_NAME');
  });
});
