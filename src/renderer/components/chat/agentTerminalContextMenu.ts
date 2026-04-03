interface AgentTerminalContextMenuItem {
  id: string;
  label: string;
  disabled?: boolean;
  type?: 'separator';
}

interface BuildAgentTerminalContextMenuItemsOptions {
  canMerge: boolean;
  hasSelection: boolean;
  hasLatestOutputBlock: boolean;
  t: (value: string) => string;
}

export function buildAgentTerminalContextMenuItems({
  canMerge,
  hasSelection,
  hasLatestOutputBlock,
  t,
}: BuildAgentTerminalContextMenuItemsOptions): AgentTerminalContextMenuItem[] {
  return [
    { id: 'split', label: t('Split Agent') },
    ...(canMerge ? [{ id: 'merge', label: t('Merge Agent') }] : []),
    { id: 'separator-0', label: '', type: 'separator' },
    { id: 'clear', label: t('Clear terminal') },
    { id: 'refresh', label: t('Refresh terminal') },
    { id: 'separator-1', label: '', type: 'separator' },
    { id: 'copy', label: t('Copy'), disabled: !hasSelection },
    {
      id: 'copyLatestOutputBlock',
      label: t('Copy latest output block'),
      disabled: !hasLatestOutputBlock,
    },
    { id: 'paste', label: t('Paste') },
    { id: 'selectAll', label: t('Select all') },
  ];
}
