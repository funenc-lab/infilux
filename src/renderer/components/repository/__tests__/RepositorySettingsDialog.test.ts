/* @vitest-environment jsdom */

import type { ProjectConfigScheme } from '@shared/types';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const getRepositorySettings = vi.fn();
const getClaudeGlobalPolicy = vi.fn();
const getClaudeProjectPolicy = vi.fn();
const getProjectConfigSchemeSelection = vi.fn();
const saveRepositorySettings = vi.fn();
const projectConfigSchemes: ProjectConfigScheme[] = [];

vi.mock('@/App/storage', () => ({
  DEFAULT_REPOSITORY_SETTINGS: {
    hidden: false,
    autoInitWorktree: false,
    initScript: '',
    worktreeInitializationOverride: null,
  },
  getRepositorySettings,
  getClaudeGlobalPolicy,
  saveRepositorySettings,
  getClaudeProjectPolicy,
  saveClaudeProjectPolicy: vi.fn(),
  getProjectConfigSchemeSelection,
}));

vi.mock('@/i18n', () => ({
  useI18n: () => ({
    t: (value: string) => value,
  }),
}));

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? React.createElement('div', { 'data-testid': 'dialog-root' }, children) : null,
  DialogPopup: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', null, children),
  DialogHeader: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', null, children),
  DialogTitle: ({ children }: { children: React.ReactNode }) =>
    React.createElement('h2', null, children),
  DialogDescription: ({ children }: { children: React.ReactNode }) =>
    React.createElement('p', null, children),
  DialogPanel: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', null, children),
  DialogFooter: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', null, children),
  DialogClose: ({ render }: { render?: React.ReactElement }) => render ?? null,
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { children?: React.ReactNode }) =>
    React.createElement('button', { type: 'button', ...props }, children),
}));

vi.mock('@/components/ui/switch', () => ({
  Switch: ({
    checked,
    onCheckedChange,
    id,
  }: {
    checked: boolean;
    onCheckedChange: (checked: boolean) => void;
    id?: string;
  }) =>
    React.createElement('input', {
      id,
      type: 'checkbox',
      checked,
      onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
        onCheckedChange(event.currentTarget.checked),
    }),
}));

vi.mock('@/components/ui/textarea', () => ({
  Textarea: (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) =>
    React.createElement('textarea', props),
}));

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => children,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => children,
  TooltipPopup: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', null, children),
}));

vi.mock('@/components/settings/claude-policy', () => ({
  ClaudePolicyEditorDialog: ({ open, scope }: { open: boolean; scope: string }) =>
    open ? React.createElement('div', { 'data-testid': 'policy-editor' }, `editor:${scope}`) : null,
}));

vi.mock('@/stores/agentSessions', () => ({
  useAgentSessionsStore: (
    selector: (state: { markClaudePolicyStaleForRepo: typeof vi.fn }) => unknown
  ) =>
    selector({
      markClaudePolicyStaleForRepo: vi.fn(),
    }),
}));

vi.mock('@/stores/settings', () => ({
  useSettingsStore: (
    selector: (state: { projectConfigSchemes: ProjectConfigScheme[] }) => unknown
  ) =>
    selector({
      projectConfigSchemes,
    }),
}));

describe('RepositorySettingsDialog', () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    getRepositorySettings.mockReset();
    getClaudeGlobalPolicy.mockReset();
    getClaudeProjectPolicy.mockReset();
    getProjectConfigSchemeSelection.mockReset();
    saveRepositorySettings.mockReset();
    projectConfigSchemes.length = 0;
    getRepositorySettings.mockReturnValue({
      hidden: false,
      autoInitWorktree: false,
      initScript: '',
      worktreeInitializationOverride: null,
    });
    getClaudeGlobalPolicy.mockReturnValue(null);
    getClaudeProjectPolicy.mockReturnValue({
      repoPath: '/repo',
      allowedCapabilityIds: ['command:review'],
      blockedCapabilityIds: ['command:dangerous'],
      allowedSharedMcpIds: [],
      blockedSharedMcpIds: ['shared:filesystem'],
      allowedPersonalMcpIds: [],
      blockedPersonalMcpIds: [],
      updatedAt: 1,
    });
    getProjectConfigSchemeSelection.mockReturnValue(null);

    vi.stubGlobal('window', {
      ...window,
      electronAPI: {
        claudePolicy: {
          preview: {
            resolve: vi.fn().mockResolvedValue({
              repoPath: '/repo',
              worktreePath: '/repo',
              allowedCapabilityIds: [
                'command:review',
                'legacy-skill:planner',
                'legacy-skill:writer',
              ],
              blockedCapabilityIds: ['command:dangerous'],
              allowedSharedMcpIds: ['shared:filesystem'],
              blockedSharedMcpIds: [],
              allowedPersonalMcpIds: [],
              blockedPersonalMcpIds: [],
              capabilityProvenance: {},
              sharedMcpProvenance: {},
              personalMcpProvenance: {},
              hash: 'preview-hash',
              policyHash: 'preview-hash',
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

  it('shows a project skill and MCP summary and opens the shared editor dialog', async () => {
    const { RepositorySettingsDialog } = await import('../RepositorySettingsDialog');

    await act(async () => {
      root?.render(
        React.createElement(RepositorySettingsDialog, {
          open: true,
          onOpenChange: vi.fn(),
          repoPath: '/repo',
          repoName: 'repo',
        })
      );
    });

    expect(container?.textContent).toContain('Project Skill & MCP');
    expect(container?.textContent).toContain('Skills');
    expect(container?.textContent).toContain('Shared MCP');
    expect(container?.querySelector('[data-policy-config-summary="project"]')).not.toBeNull();
    expect(container?.querySelector('[data-policy-effective-summary="project"]')).not.toBeNull();
    expect(
      container?.querySelector('[data-policy-effective-summary="project"]')?.textContent
    ).toContain('Effective Access');
    expect(
      container?.querySelector('[data-policy-effective-summary="project"]')?.textContent
    ).toContain('2');
    expect(container?.querySelector('[data-policy-preview-group="skills"]')).toBeNull();
    expect(container?.querySelector('[data-policy-preview-group="shared-mcp"]')).toBeNull();

    await act(async () => {
      container
        ?.querySelector<HTMLButtonElement>('[data-policy-action="edit-project"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container?.querySelector('[data-testid="policy-editor"]')?.textContent).toBe(
      'editor:project'
    );
  });

  it('inherits scheme worktree initialization and creates an explicit local override on edit', async () => {
    projectConfigSchemes.push({
      id: 'scheme-alpha',
      name: 'Alpha',
      description: '',
      claudePolicy: {
        allowedCapabilityIds: [],
        blockedCapabilityIds: [],
        allowedSharedMcpIds: [],
        blockedSharedMcpIds: [],
        allowedPersonalMcpIds: [],
        blockedPersonalMcpIds: [],
        updatedAt: 1,
      },
      promptPresetId: null,
      worktreeInitialization: {
        autoInitWorktree: true,
        initScript: 'pnpm install',
      },
      createdAt: 1,
      updatedAt: 1,
    });
    getProjectConfigSchemeSelection.mockReturnValue({ schemeId: 'scheme-alpha', updatedAt: 1 });

    const { RepositorySettingsDialog } = await import('../RepositorySettingsDialog');
    await act(async () => {
      root?.render(
        React.createElement(RepositorySettingsDialog, {
          open: true,
          onOpenChange: vi.fn(),
          repoPath: '/repo',
          repoName: 'repo',
        })
      );
    });

    const autoInitSwitch = container?.querySelector<HTMLInputElement>('#auto-init-switch');
    const initScript = container?.querySelector<HTMLTextAreaElement>('#init-script');
    expect(autoInitSwitch?.checked).toBe(true);
    expect(initScript?.value).toBe('pnpm install');

    await act(async () => {
      autoInitSwitch?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(async () => {
      container
        ?.querySelector<HTMLButtonElement>('[data-repository-settings-action="save"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(saveRepositorySettings).toHaveBeenCalledWith(
      '/repo',
      expect.objectContaining({
        autoInitWorktree: false,
        initScript: 'pnpm install',
        worktreeInitializationOverride: {
          autoInitWorktree: false,
          initScript: 'pnpm install',
        },
      })
    );
  });
});
