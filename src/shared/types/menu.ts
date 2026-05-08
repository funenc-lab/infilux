export const MENU_ACTIONS = {
  OPEN_SETTINGS: 'open-settings',
  OPEN_ACTION_PANEL: 'open-action-panel',
  PASTE_AGENT_ATTACHMENT: 'paste-agent-attachment',
  TOGGLE_DEVTOOLS: 'toggle-devtools',
} as const;

export type MenuAction = (typeof MENU_ACTIONS)[keyof typeof MENU_ACTIONS];
