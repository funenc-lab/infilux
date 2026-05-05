/* @vitest-environment jsdom */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IntegrationSettings } from '../IntegrationSettings';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const setAgentIntegration = vi.fn();
const getStatus = vi.fn();
const tmuxCheck = vi.fn();

vi.mock('lucide-react', () => {
  const icon = (name: string) => (props: Record<string, unknown>) =>
    React.createElement('svg', { ...props, 'data-icon': name });

  return {
    ChevronDownIcon: icon('ChevronDownIcon'),
    ChevronsUpDownIcon: icon('ChevronsUpDownIcon'),
    ChevronUpIcon: icon('ChevronUpIcon'),
    Check: icon('Check'),
    Minus: icon('Minus'),
  };
});

vi.mock('@/i18n', () => ({
  useI18n: () => ({
    t: (value: string, params?: Record<string, string | number>) => {
      if (!params) return value;
      return value.replace(/\{\{(\w+)\}\}/g, (match, token) =>
        params[token] === undefined ? match : String(params[token])
      );
    },
  }),
}));

vi.mock('@/stores/settings', () => ({
  useSettingsStore: () => ({
    agentIntegration: {
      atMentionedKeybinding: 'mod+shift+a',
      autoSessionRollover: 'manual',
      enabled: true,
      enableProviderDisableFeature: true,
      enableProviderWatcher: true,
      enhancedInputAutoPopup: 'always',
      permissionRequestHookEnabled: true,
      selectionChangedDebounce: 300,
      showProviderSwitcher: true,
      statusLineEnabled: true,
      statusLineFields: {
        context: true,
        cost: true,
        model: true,
      },
      stopHookEnabled: true,
      tmuxEnabled: false,
    },
    setAgentIntegration,
  }),
}));

vi.mock('../agent-provider', () => ({
  ProviderList: () => React.createElement('div', { 'data-testid': 'provider-list' }),
}));

vi.mock('../KeybindingsSettings', () => ({
  KeybindingInput: ({ value }: { value: string }) =>
    React.createElement('input', {
      'aria-label': 'Mention Shortcut',
      readOnly: true,
      value,
    }),
}));

vi.mock('../mcp', () => ({
  McpSection: () => React.createElement('section', { 'data-testid': 'mcp-section' }),
}));

vi.mock('../plugins', () => ({
  PluginsSection: () => React.createElement('section', { 'data-testid': 'plugins-section' }),
}));

vi.mock('../prompts', () => ({
  PromptsSection: () => React.createElement('section', { 'data-testid': 'prompts-section' }),
}));

function installElectronApi() {
  Object.defineProperty(window, 'electronAPI', {
    configurable: true,
    value: {
      env: {
        platform: 'darwin',
      },
      mcp: {
        getStatus,
      },
      tmux: {
        check: tmuxCheck,
      },
    },
  });
}

function mountIntegrationSettings(): { container: HTMLDivElement; root: Root } {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(React.createElement(IntegrationSettings, { repoPath: '/repo/current' }));
  });

  return { container, root };
}

function getProgressbar(container: HTMLElement, label: string): HTMLElement {
  const progressbar = Array.from(
    container.querySelectorAll<HTMLElement>('[role="progressbar"]')
  ).find((item) => item.getAttribute('aria-label') === label);

  if (!progressbar) {
    throw new Error(`Missing progressbar: ${label}`);
  }

  return progressbar;
}

describe('agent integration capability settings', () => {
  beforeEach(() => {
    installElectronApi();
    getStatus.mockResolvedValue({ port: 3210 });
    tmuxCheck.mockResolvedValue({ installed: true });
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  it('renders provider capability coverage from the integration settings surface', () => {
    const { container, root } = mountIntegrationSettings();

    expect(container.textContent).toContain('Agent capability coverage');
    expect(container.textContent).toContain(
      'These controls use provider capabilities instead of assuming every AI tool supports the same hooks.'
    );
    expect(container.textContent).toContain('Claude Code');
    expect(container.textContent).toContain('5/5 capabilities');
    expect(container.textContent).toContain('Full coverage');
    expect(container.textContent).toContain('Codex CLI');
    expect(container.textContent).toContain('1/5 capabilities');
    expect(container.textContent).toContain('Partial coverage');
    expect(container.textContent).toContain('Cursor CLI');
    expect(container.textContent).toContain('0/5 capabilities');
    expect(container.textContent).toContain('No coverage');

    expect(getProgressbar(container, 'Claude Code: 5/5 capabilities')).toHaveProperty(
      'ariaValueNow',
      '100'
    );
    expect(getProgressbar(container, 'Codex CLI: 1/5 capabilities')).toHaveProperty(
      'ariaValueNow',
      '20'
    );
    expect(getProgressbar(container, 'Cursor CLI: 0/5 capabilities')).toHaveProperty(
      'ariaValueNow',
      '0'
    );

    act(() => {
      root.unmount();
    });
  });

  it('shows provider-scoped support notes without Claude-only generic copy', () => {
    const { container, root } = mountIntegrationSettings();

    expect(container.textContent).toContain(
      'Currently supported by Claude Code · 3 waiting for provider adapter'
    );
    expect(container.textContent).toContain(
      'Delay before sending selection changes to supported editor bridges'
    );
    expect(container.textContent).toContain('Send selected code range to supported editor bridges');
    expect(container.textContent).toContain(
      'Use provider completion hooks for precise agent completion notifications'
    );
    expect(container.textContent).toContain(
      'Notify when a supported agent asks for input or permission'
    );
    expect(container.textContent).not.toContain(
      'Delay before sending selection changes to Claude Code'
    );
    expect(container.textContent).not.toContain('Send selected code range to Claude Code');
    expect(container.textContent).not.toContain(
      'Use Claude Stop hook for precise agent completion notifications'
    );
    expect(container.textContent).not.toContain(
      'Notify when Claude asks a question (requires PermissionRequest hook)'
    );

    act(() => {
      root.unmount();
    });
  });
});
