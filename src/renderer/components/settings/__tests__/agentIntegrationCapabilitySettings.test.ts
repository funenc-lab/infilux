/* @vitest-environment jsdom */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IntegrationSettings } from '../IntegrationSettings';

const currentDir = dirname(fileURLToPath(import.meta.url));
const integrationSettingsSource = readFileSync(
  resolve(currentDir, '../IntegrationSettings.tsx'),
  'utf8'
);
const settingsShellSource = readFileSync(resolve(currentDir, '../SettingsShell.tsx'), 'utf8');

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
    ChevronRight: icon('ChevronRight'),
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

  it('does not render capability coverage metadata from the integration settings surface', () => {
    const { container, root } = mountIntegrationSettings();

    expect(container.textContent).not.toContain('Agent capability coverage');
    expect(container.textContent).not.toContain('Provider coverage summary');
    expect(container.textContent).not.toContain('Currently supported by');
    expect(container.querySelector('[aria-label="Capability coverage legend"]')).toBeNull();
    expect(container.textContent).toContain('Agent IDE Bridge');

    act(() => {
      root.unmount();
    });
  });

  it('keeps integration controls without provider capability annotations', () => {
    const { container, root } = mountIntegrationSettings();

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
    expect(container.textContent).not.toContain('waiting for provider adapter');

    act(() => {
      root.unmount();
    });
  });

  it('groups provider, bridge, and developer tools into distinct sections', () => {
    const { container, root } = mountIntegrationSettings();

    const sections = Array.from(container.querySelectorAll('section'));
    expect(sections.length).toBeGreaterThanOrEqual(3);
    expect(container.textContent).toContain('Agent Providers');
    expect(container.textContent).toContain('Agent IDE Bridge');
    expect(container.textContent).toContain('Developer Tools');

    act(() => {
      root.unmount();
    });
  });

  it('keeps status line field choices behind an advanced disclosure', () => {
    const { container, root } = mountIntegrationSettings();

    expect(container.querySelector('[data-slot="collapsible-trigger"]')).not.toBeNull();
    expect(container.textContent).toContain('Display Fields');
    expect(container.textContent).toContain('Advanced');

    act(() => {
      root.unmount();
    });
  });

  it('uses the shared section layout and responsive status field grid', () => {
    expect(integrationSettingsSource).toContain("title={t('Agent IDE Bridge')}");
    expect(integrationSettingsSource).toContain('grid-cols-1');
    expect(integrationSettingsSource).toContain('sm:grid-cols-2');
    expect(integrationSettingsSource).toContain('lg:grid-cols-3');
    expect(integrationSettingsSource).toContain('selectedStatusLineFieldCount');
  });

  it('distinguishes the read-only catalog from editable integration tools', () => {
    expect(settingsShellSource).toContain("label: t('Skill & MCP Catalog')");
    expect(integrationSettingsSource).toContain("title={t('Developer Tools')}");
  });
});
