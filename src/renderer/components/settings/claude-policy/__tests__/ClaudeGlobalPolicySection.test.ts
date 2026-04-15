/* @vitest-environment jsdom */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const getClaudeGlobalPolicy = vi.fn();

vi.mock('@/App/storage', () => ({
  getClaudeGlobalPolicy,
  saveClaudeGlobalPolicy: vi.fn(),
}));

vi.mock('@/i18n', () => ({
  useI18n: () => ({
    t: (value: string) => value,
  }),
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { children?: React.ReactNode }) =>
    React.createElement('button', { type: 'button', ...props }, children),
}));

vi.mock('@/components/ui/badge', () => ({
  Badge: ({ children }: { children: React.ReactNode }) =>
    React.createElement('span', null, children),
}));

vi.mock('@/components/ui/input', () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) =>
    React.createElement('input', props),
}));

vi.mock('@/components/settings/claude-policy/ClaudePolicyEditorDialog', () => ({
  ClaudePolicyEditorDialog: ({ open, scope }: { open: boolean; scope: string }) =>
    open ? React.createElement('div', { 'data-testid': 'policy-editor' }, `editor:${scope}`) : null,
}));

vi.mock('@/stores/agentSessions', () => ({
  useAgentSessionsStore: (
    selector: (state: { markClaudePolicyStaleGlobally: typeof vi.fn }) => unknown
  ) =>
    selector({
      markClaudePolicyStaleGlobally: vi.fn(),
    }),
}));

describe('ClaudeCapabilityCatalogSection global policy entry', () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    getClaudeGlobalPolicy.mockReset();
    getClaudeGlobalPolicy.mockReturnValue({
      allowedCapabilityIds: ['command:review'],
      blockedCapabilityIds: [],
      allowedSharedMcpIds: [],
      blockedSharedMcpIds: ['shared:filesystem'],
      allowedPersonalMcpIds: [],
      blockedPersonalMcpIds: [],
      updatedAt: 1,
    });

    vi.stubGlobal('window', {
      ...window,
      electronAPI: {
        claudePolicy: {
          catalog: {
            list: vi.fn().mockResolvedValue({
              capabilities: [],
              sharedMcpServers: [],
              personalMcpServers: [],
              generatedAt: 1,
            }),
          },
        },
      },
    });

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root?.unmount();
      });
    }
    container?.remove();
    root = null;
    container = null;
    vi.unstubAllGlobals();
  });

  it('shows a global policy summary and opens the shared editor dialog', async () => {
    const { ClaudeCapabilityCatalogSection } = await import('../ClaudeCapabilityCatalogSection');

    await act(async () => {
      root?.render(React.createElement(ClaudeCapabilityCatalogSection));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container?.textContent).toContain('Global Skill & MCP');
    expect(container?.textContent).toContain('Enabled');

    await act(async () => {
      container
        ?.querySelector<HTMLButtonElement>('[data-policy-action="edit-global"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container?.querySelector('[data-testid="policy-editor"]')?.textContent).toBe(
      'editor:global'
    );
  });
});
