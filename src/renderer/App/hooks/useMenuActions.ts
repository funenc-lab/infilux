import { MENU_ACTIONS } from '@shared/types';
import { useEffect } from 'react';
import { dispatchAgentAttachmentPasteEvent } from '@/lib/agentAttachmentPasteEvent';

export function useMenuActions(
  openSettings: () => void,
  setActionPanelOpen: (open: boolean) => void
) {
  useEffect(() => {
    const cleanup = window.electronAPI.menu.onAction((action) => {
      switch (action) {
        case MENU_ACTIONS.OPEN_SETTINGS:
          openSettings();
          break;
        case MENU_ACTIONS.OPEN_ACTION_PANEL:
          setActionPanelOpen(true);
          break;
        case MENU_ACTIONS.PASTE_AGENT_ATTACHMENT:
          dispatchAgentAttachmentPasteEvent();
          break;
      }
    });
    return cleanup;
  }, [openSettings, setActionPanelOpen]);
}
