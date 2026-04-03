import { describe, expect, it } from 'vitest';
import { buildAgentTerminalContextMenuItems } from '../agentTerminalContextMenu';

const t = (value: string) => value;

describe('agentTerminalContextMenu', () => {
  it('enables copying the latest output block when recent output exists', () => {
    const menuItems = buildAgentTerminalContextMenuItems({
      canMerge: true,
      hasSelection: false,
      hasLatestOutputBlock: true,
      t,
    });

    expect(menuItems).toContainEqual({
      id: 'copyLatestOutputBlock',
      label: 'Copy latest output block',
      disabled: false,
    });
  });

  it('disables copying the latest output block when nothing useful is available', () => {
    const menuItems = buildAgentTerminalContextMenuItems({
      canMerge: false,
      hasSelection: true,
      hasLatestOutputBlock: false,
      t,
    });

    expect(menuItems).toContainEqual({
      id: 'copyLatestOutputBlock',
      label: 'Copy latest output block',
      disabled: true,
    });
  });
});
