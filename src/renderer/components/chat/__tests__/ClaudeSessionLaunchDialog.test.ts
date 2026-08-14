/* @vitest-environment jsdom */

import type { ClaudeCapabilityCatalog } from '@shared/types';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('@/i18n', () => ({
  useI18n: () => ({
    t: (value: string) => value,
  }),
}));

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? React.createElement('div', { 'data-testid': 'dialog-root' }, children) : null,
  DialogPopup: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', { 'data-testid': 'dialog-popup' }, children),
  DialogHeader: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', null, children),
  DialogTitle: ({ children }: { children: React.ReactNode }) =>
    React.createElement('h2', null, children),
  DialogDescription: ({ children }: { children: React.ReactNode }) =>
    React.createElement('p', null, children),
  DialogFooter: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', null, children),
  DialogClose: ({ render }: { render?: React.ReactElement }) => render ?? null,
}));

vi.mock('@/components/ui/scroll-area', () => ({
  ScrollArea: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', { 'data-testid': 'scroll-area' }, children),
}));

const catalogList =
  vi.fn<
    (request: { repoPath: string; worktreePath: string }) => Promise<ClaudeCapabilityCatalog>
  >();

let catalogInvalidationListener:
  | ((request: { repoPath?: string; worktreePath?: string }) => void)
  | undefined;

function installElectronApi(catalog: ClaudeCapabilityCatalog) {
  catalogList.mockResolvedValue(catalog);
  Object.defineProperty(window, 'electronAPI', {
    configurable: true,
    value: {
      claudePolicy: {
        catalog: {
          list: catalogList,
          onInvalidated: (
            listener: (request: { repoPath?: string; worktreePath?: string }) => void
          ) => {
            catalogInvalidationListener = listener;
            return () => {
              catalogInvalidationListener = undefined;
            };
          },
        },
      },
    },
  });
}

async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function setInputValue(element: HTMLInputElement, value: string) {
  const valueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value'
  )?.set;
  valueSetter?.call(element, value);
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

describe('ClaudeSessionLaunchDialog', () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    catalogList.mockReset();
    catalogInvalidationListener = undefined;
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
    Reflect.deleteProperty(window, 'electronAPI');
  });

  it('clears skill search when switching to MCP and launches with worktree MCP decisions', async () => {
    installElectronApi({
      capabilities: [
        {
          id: 'legacy-skill:planner',
          kind: 'legacy-skill',
          name: 'Planner',
          sourceScope: 'worktree',
          sourcePath: '/repo/worktrees/feature-a/.agents/skills/planner/SKILL.md',
          isAvailable: true,
          isConfigurable: true,
        },
      ],
      sharedMcpServers: [
        {
          id: 'shared:filesystem',
          name: 'Filesystem',
          scope: 'shared',
          sourceScope: 'worktree',
          sourcePath: '/repo/worktrees/feature-a/.mcp.json',
          transportType: 'stdio',
          isAvailable: true,
          isConfigurable: true,
        },
      ],
      personalMcpServers: [],
      generatedAt: 1,
    });

    const handleLaunch = vi.fn();
    const { ClaudeSessionLaunchDialog } = await import('../ClaudeSessionLaunchDialog');

    await act(async () => {
      root?.render(
        React.createElement(ClaudeSessionLaunchDialog, {
          open: true,
          onOpenChange: vi.fn(),
          repoPath: '/repo',
          worktreePath: '/repo/worktrees/feature-a',
          agentLabel: 'Claude',
          initialPolicy: null,
          onLaunch: handleLaunch,
        })
      );
    });
    await flushEffects();

    const searchInput = container?.querySelector<HTMLInputElement>(
      '[data-session-launch-search="input"]'
    );
    expect(searchInput).not.toBeNull();

    await act(async () => {
      if (searchInput) {
        setInputValue(searchInput, 'planner');
      }
    });
    await flushEffects();

    expect(container?.querySelector('[data-policy-item-id="legacy-skill:planner"]')).not.toBeNull();

    await act(async () => {
      container
        ?.querySelector<HTMLButtonElement>('[data-session-launch-tab="mcp"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flushEffects();

    expect(searchInput?.value).toBe('');
    expect(container?.querySelector('[data-policy-item-id="shared:filesystem"]')).not.toBeNull();

    await act(async () => {
      container
        ?.querySelector<HTMLButtonElement>(
          '[data-policy-item-id="shared:filesystem"] [data-policy-decision="block"]'
        )
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flushEffects();

    await act(async () => {
      container
        ?.querySelector<HTMLButtonElement>('[data-session-launch-action="launch"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(catalogList).toHaveBeenCalledWith({
      repoPath: '/repo',
      worktreePath: '/repo/worktrees/feature-a',
    });
    expect(handleLaunch).toHaveBeenCalledWith(
      expect.objectContaining({
        allowedSharedMcpIds: [],
        blockedSharedMcpIds: ['shared:filesystem'],
      }),
      undefined
    );
  });

  it('reloads the open dialog when a newly added skill invalidates its catalog scope', async () => {
    catalogList
      .mockResolvedValueOnce({
        capabilities: [],
        sharedMcpServers: [],
        personalMcpServers: [],
        generatedAt: 1,
      })
      .mockResolvedValueOnce({
        capabilities: [
          {
            id: 'legacy-skill:new-skill',
            kind: 'legacy-skill',
            name: 'New Skill',
            sourceScope: 'worktree',
            sourcePath: '/repo/worktrees/feature-a/.agents/skills/new-skill/SKILL.md',
            isAvailable: true,
            isConfigurable: true,
          },
        ],
        sharedMcpServers: [],
        personalMcpServers: [],
        generatedAt: 2,
      });
    installElectronApi({
      capabilities: [],
      sharedMcpServers: [],
      personalMcpServers: [],
      generatedAt: 1,
    });
    const { ClaudeSessionLaunchDialog } = await import('../ClaudeSessionLaunchDialog');

    await act(async () => {
      root?.render(
        React.createElement(ClaudeSessionLaunchDialog, {
          open: true,
          onOpenChange: vi.fn(),
          repoPath: '/repo',
          worktreePath: '/repo/worktrees/feature-a',
          agentLabel: 'Claude',
          initialPolicy: null,
          onLaunch: vi.fn(),
        })
      );
    });
    await flushEffects();

    await act(async () => {
      catalogInvalidationListener?.({
        repoPath: '/repo',
        worktreePath: '/repo/worktrees/feature-a',
      });
    });
    await flushEffects();

    expect(catalogList).toHaveBeenCalledTimes(2);
    expect(
      container?.querySelector('[data-policy-item-id="legacy-skill:new-skill"]')
    ).not.toBeNull();
  });
});
