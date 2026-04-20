/* @vitest-environment jsdom */

import type {
  ClaudeCapabilityCatalog,
  ClaudeProjectPolicy,
  ResolveClaudePolicyPreviewResult,
} from '@shared/types';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const translateMock = vi.fn((value: string) => value);

vi.mock('@/i18n', () => ({
  useI18n: () => ({
    t: (value: string) => translateMock(value),
  }),
}));

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? React.createElement('div', { 'data-testid': 'dialog-root' }, children) : null,
  DialogPopup: ({
    children,
    className,
    ...props
  }: {
    children: React.ReactNode;
    className?: string;
    [key: string]: unknown;
  }) =>
    React.createElement('div', { 'data-testid': 'dialog-popup', className, ...props }, children),
  DialogHeader: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', null, children),
  DialogTitle: ({ children }: { children: React.ReactNode }) =>
    React.createElement('h2', null, children),
  DialogDescription: ({ children }: { children: React.ReactNode }) =>
    React.createElement('p', null, children),
  DialogPanel: ({ children, className }: { children: React.ReactNode; className?: string }) =>
    React.createElement('div', { 'data-testid': 'dialog-panel', className }, children),
  DialogFooter: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', null, children),
  DialogClose: ({ render }: { render?: React.ReactElement }) => render ?? null,
}));

const catalogList =
  vi.fn<
    (request?: { repoPath?: string; worktreePath?: string }) => Promise<ClaudeCapabilityCatalog>
  >();
const previewResolve =
  vi.fn<
    (request: {
      repoPath: string;
      worktreePath: string;
      projectPolicy: ClaudeProjectPolicy | null;
      worktreePolicy: ClaudeProjectPolicy | null;
    }) => Promise<ResolveClaudePolicyPreviewResult>
  >();

function installElectronApi(
  catalog: ClaudeCapabilityCatalog,
  preview: ResolveClaudePolicyPreviewResult
) {
  catalogList.mockResolvedValue(catalog);
  previewResolve.mockResolvedValue(preview);
  Object.defineProperty(window, 'electronAPI', {
    configurable: true,
    value: {
      claudePolicy: {
        catalog: {
          list: catalogList,
        },
        preview: {
          resolve: previewResolve,
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

describe('ClaudePolicyEditorDialog', () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    catalogList.mockReset();
    previewResolve.mockReset();
    translateMock.mockReset();
    translateMock.mockImplementation((value: string) => value);
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

  it('edits allow and block decisions and saves the scoped policy draft', async () => {
    installElectronApi(
      {
        capabilities: [
          {
            id: 'command:review',
            kind: 'command',
            name: 'Review',
            sourceScope: 'project',
            sourcePath: '/repo/.claude/commands/review.md',
            isAvailable: true,
            isConfigurable: true,
          },
          {
            id: 'legacy-skill:planner',
            kind: 'legacy-skill',
            name: 'Planner',
            sourceScope: 'project',
            sourcePath: '/repo/.agents/skills/planner/SKILL.md',
            sourcePaths: [
              '/repo/.agents/skills/planner/SKILL.md',
              '/repo/.codex/skills/planner/SKILL.md',
            ],
            isAvailable: true,
            isConfigurable: true,
          },
        ],
        sharedMcpServers: [
          {
            id: 'shared:filesystem',
            name: 'Filesystem',
            scope: 'shared',
            sourceScope: 'project',
            sourcePath: '/repo/.mcp.json',
            transportType: 'stdio',
            isAvailable: true,
            isConfigurable: true,
          },
        ],
        personalMcpServers: [],
        generatedAt: 1,
      },
      {
        repoPath: '/repo',
        worktreePath: '/repo',
        allowedCapabilityIds: [],
        blockedCapabilityIds: ['command:review'],
        allowedSharedMcpIds: ['shared:filesystem'],
        blockedSharedMcpIds: [],
        allowedPersonalMcpIds: [],
        blockedPersonalMcpIds: [],
        capabilityProvenance: {
          'command:review': {
            source: 'project-policy',
            decision: 'block',
          },
        },
        sharedMcpProvenance: {
          'shared:filesystem': {
            source: 'project-policy',
            decision: 'allow',
          },
        },
        personalMcpProvenance: {},
        hash: 'hash-preview',
        policyHash: 'hash-preview',
      }
    );

    const handleSave = vi.fn();
    const { ClaudePolicyEditorDialog } = await import('../ClaudePolicyEditorDialog');

    await act(async () => {
      root?.render(
        React.createElement(ClaudePolicyEditorDialog, {
          open: true,
          onOpenChange: vi.fn(),
          scope: 'project',
          globalPolicy: null,
          repoPath: '/repo',
          repoName: 'repo',
          projectPolicy: null,
          worktreePolicy: null,
          onSave: handleSave,
        })
      );
    });
    await flushEffects();

    expect(catalogList).toHaveBeenCalledWith({
      repoPath: '/repo',
      worktreePath: '/repo',
    });
    expect(container?.textContent).toContain('Effective Access');
    expect(container?.querySelector('[data-policy-preview-group="skills"]')).toBeNull();
    expect(container?.querySelector('[data-policy-item-id="legacy-skill:planner"]')).not.toBeNull();
    expect(container?.textContent).toContain('2 sources');
    expect(container?.querySelector('[data-policy-item-id="shared:filesystem"]')).toBeNull();

    await act(async () => {
      const searchInput = container?.querySelector<HTMLInputElement>(
        '[data-policy-search="input"]'
      );
      if (searchInput) {
        searchInput.value = '.codex/skills/planner';
        searchInput.dispatchEvent(new Event('input', { bubbles: true }));
        searchInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    await flushEffects();

    expect(container?.querySelector('[data-policy-item-id="legacy-skill:planner"]')).not.toBeNull();

    await act(async () => {
      container
        ?.querySelector<HTMLButtonElement>(
          '[data-policy-source-paths-trigger="legacy-skill:planner"]'
        )
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flushEffects();

    expect(container?.textContent).toContain('/repo/.agents/skills/planner/SKILL.md');
    expect(container?.textContent).toContain('/repo/.codex/skills/planner/SKILL.md');

    await act(async () => {
      container
        ?.querySelector<HTMLButtonElement>('[data-policy-action="toggle-preview"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flushEffects();

    await act(async () => {
      container
        ?.querySelector<HTMLButtonElement>('[data-policy-tab="mcp"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flushEffects();

    expect(container?.querySelector('[data-policy-item-id="legacy-skill:planner"]')).toBeNull();
    expect(container?.querySelector('[data-policy-item-id="shared:filesystem"]')).not.toBeNull();

    await act(async () => {
      const searchInput = container?.querySelector<HTMLInputElement>(
        '[data-policy-search="input"]'
      );
      if (searchInput) {
        searchInput.value = 'file';
        searchInput.dispatchEvent(new Event('input', { bubbles: true }));
        searchInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    await flushEffects();

    expect(container?.querySelector('[data-policy-item-id="shared:filesystem"]')).not.toBeNull();

    const sharedMcpRow = container?.querySelector('[data-policy-item-id="shared:filesystem"]');

    await act(async () => {
      sharedMcpRow
        ?.querySelector<HTMLButtonElement>('[data-policy-decision="allow"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flushEffects();

    await act(async () => {
      container
        ?.querySelector<HTMLButtonElement>('[data-policy-tab="skills"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      const searchInput = container?.querySelector<HTMLInputElement>(
        '[data-policy-search="input"]'
      );
      if (searchInput) {
        searchInput.value = 'plan';
        searchInput.dispatchEvent(new Event('input', { bubbles: true }));
        searchInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    await flushEffects();

    const skillRow = container?.querySelector('[data-policy-item-id="legacy-skill:planner"]');

    await act(async () => {
      skillRow
        ?.querySelector<HTMLButtonElement>('[data-policy-decision="allow"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flushEffects();

    await act(async () => {
      container
        ?.querySelector<HTMLButtonElement>('[data-policy-action="save"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(previewResolve).toHaveBeenCalled();
    expect(container?.textContent).toContain('Skills');
    expect(container?.textContent).not.toContain('Capabilities');
    expect(container?.textContent).not.toContain('Clear');
    expect(container?.textContent).not.toContain('Run the review flow');
    expect(container?.textContent).not.toContain('Scope Summary');
    expect(container?.textContent).not.toContain('Preview workspace');
    expect(container?.textContent).not.toContain('Plan a feature');
    expect(container?.textContent).not.toContain('/repo/.claude/commands/review.md');
    expect(container?.textContent).not.toContain('/repo/.agents/skills/planner/SKILL.md');
    expect(container?.querySelector('[data-policy-item-id="command:review"]')).toBeNull();
    expect(container?.querySelector('[data-policy-preview-group="skills"]')).not.toBeNull();
    expect(container?.querySelector('[data-policy-section="capabilities"]')).toBeNull();
    expect(container?.querySelector('[data-policy-section="skills"]')).not.toBeNull();
    expect(container?.querySelector('[data-policy-tab="skills"]')).not.toBeNull();
    expect(container?.querySelector('[data-policy-tab="mcp"]')).not.toBeNull();
    expect(handleSave).toHaveBeenCalledWith(
      expect.objectContaining({
        repoPath: '/repo',
        allowedCapabilityIds: ['legacy-skill:planner'],
        blockedCapabilityIds: [],
        allowedSharedMcpIds: ['shared:filesystem'],
      }),
      expect.objectContaining({
        hash: 'hash-preview',
      })
    );
  });

  it('renders the localized project policy title through the i18n translator', async () => {
    translateMock.mockImplementation((value: string) =>
      value === 'Project Skill & MCP' ? '项目 Skill 与 MCP' : value
    );

    installElectronApi(
      {
        capabilities: [],
        sharedMcpServers: [],
        personalMcpServers: [],
        generatedAt: 1,
      },
      {
        repoPath: '/repo',
        worktreePath: '/repo',
        allowedCapabilityIds: [],
        blockedCapabilityIds: [],
        allowedSharedMcpIds: [],
        blockedSharedMcpIds: [],
        allowedPersonalMcpIds: [],
        blockedPersonalMcpIds: [],
        capabilityProvenance: {},
        sharedMcpProvenance: {},
        personalMcpProvenance: {},
        hash: 'hash-preview',
        policyHash: 'hash-preview',
      }
    );

    const { ClaudePolicyEditorDialog } = await import('../ClaudePolicyEditorDialog');

    await act(async () => {
      root?.render(
        React.createElement(ClaudePolicyEditorDialog, {
          open: true,
          onOpenChange: vi.fn(),
          scope: 'project',
          globalPolicy: null,
          repoPath: '/repo',
          repoName: 'repo',
          projectPolicy: null,
          worktreePolicy: null,
          onSave: vi.fn(),
        })
      );
    });
    await flushEffects();

    expect(container?.textContent).toContain('项目 Skill 与 MCP');
  });

  it('uses two primary actions and resets explicit decisions back to inherit', async () => {
    installElectronApi(
      {
        capabilities: [
          {
            id: 'legacy-skill:planner',
            kind: 'legacy-skill',
            name: 'Planner',
            sourceScope: 'project',
            sourcePath: '/repo/.agents/skills/planner/SKILL.md',
            isAvailable: true,
            isConfigurable: true,
          },
        ],
        sharedMcpServers: [],
        personalMcpServers: [],
        generatedAt: 1,
      },
      {
        repoPath: '/repo',
        worktreePath: '/repo',
        allowedCapabilityIds: [],
        blockedCapabilityIds: [],
        allowedSharedMcpIds: [],
        blockedSharedMcpIds: [],
        allowedPersonalMcpIds: [],
        blockedPersonalMcpIds: [],
        capabilityProvenance: {},
        sharedMcpProvenance: {},
        personalMcpProvenance: {},
        hash: 'hash-preview',
        policyHash: 'hash-preview',
      }
    );

    const handleSave = vi.fn();
    const { ClaudePolicyEditorDialog } = await import('../ClaudePolicyEditorDialog');

    await act(async () => {
      root?.render(
        React.createElement(ClaudePolicyEditorDialog, {
          open: true,
          onOpenChange: vi.fn(),
          scope: 'project',
          globalPolicy: null,
          repoPath: '/repo',
          repoName: 'repo',
          projectPolicy: null,
          worktreePolicy: null,
          onSave: handleSave,
        })
      );
    });
    await flushEffects();

    const skillRow = container?.querySelector('[data-policy-item-id="legacy-skill:planner"]');
    expect(skillRow?.querySelector('[data-policy-decision="inherit"]')).toBeNull();
    expect(skillRow?.querySelector('[data-policy-action="reset"]')).toBeNull();

    await act(async () => {
      skillRow
        ?.querySelector<HTMLButtonElement>('[data-policy-decision="allow"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flushEffects();

    expect(skillRow?.querySelector('[data-policy-action="reset"]')).not.toBeNull();

    await act(async () => {
      skillRow
        ?.querySelector<HTMLButtonElement>('[data-policy-action="reset"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flushEffects();

    expect(skillRow?.querySelector('[data-policy-action="reset"]')).toBeNull();

    const saveButton = container?.querySelector<HTMLButtonElement>('[data-policy-action="save"]');
    expect(saveButton?.disabled).toBe(true);
    expect(handleSave).not.toHaveBeenCalled();
  });

  it('applies batch decisions to the current visible items', async () => {
    installElectronApi(
      {
        capabilities: [
          {
            id: 'legacy-skill:planner',
            kind: 'legacy-skill',
            name: 'Planner',
            sourceScope: 'project',
            sourcePath: '/repo/.agents/skills/planner/SKILL.md',
            isAvailable: true,
            isConfigurable: true,
          },
          {
            id: 'legacy-skill:reviewer',
            kind: 'legacy-skill',
            name: 'Reviewer',
            sourceScope: 'project',
            sourcePath: '/repo/.agents/skills/reviewer/SKILL.md',
            isAvailable: true,
            isConfigurable: true,
          },
        ],
        sharedMcpServers: [
          {
            id: 'shared:filesystem',
            name: 'Filesystem',
            scope: 'shared',
            sourceScope: 'project',
            sourcePath: '/repo/.mcp.json',
            transportType: 'stdio',
            isAvailable: true,
            isConfigurable: true,
          },
          {
            id: 'shared:git',
            name: 'Git',
            scope: 'shared',
            sourceScope: 'project',
            sourcePath: '/repo/.mcp.json',
            transportType: 'stdio',
            isAvailable: true,
            isConfigurable: true,
          },
        ],
        personalMcpServers: [],
        generatedAt: 1,
      },
      {
        repoPath: '/repo',
        worktreePath: '/repo',
        allowedCapabilityIds: [],
        blockedCapabilityIds: [],
        allowedSharedMcpIds: [],
        blockedSharedMcpIds: [],
        allowedPersonalMcpIds: [],
        blockedPersonalMcpIds: [],
        capabilityProvenance: {},
        sharedMcpProvenance: {},
        personalMcpProvenance: {},
        hash: 'hash-preview',
        policyHash: 'hash-preview',
      }
    );

    const handleSave = vi.fn();
    const { ClaudePolicyEditorDialog } = await import('../ClaudePolicyEditorDialog');

    await act(async () => {
      root?.render(
        React.createElement(ClaudePolicyEditorDialog, {
          open: true,
          onOpenChange: vi.fn(),
          scope: 'project',
          globalPolicy: null,
          repoPath: '/repo',
          repoName: 'repo',
          projectPolicy: null,
          worktreePolicy: null,
          onSave: handleSave,
        })
      );
    });
    await flushEffects();

    await act(async () => {
      const searchInput = container?.querySelector<HTMLInputElement>(
        '[data-policy-search="input"]'
      );
      if (searchInput) {
        setInputValue(searchInput, 'plan');
      }
    });
    await flushEffects();

    const skillSection = container?.querySelector('[data-policy-section="skills"]');
    await act(async () => {
      skillSection
        ?.querySelector<HTMLButtonElement>('[data-policy-batch-action="allow"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flushEffects();

    await act(async () => {
      container
        ?.querySelector<HTMLButtonElement>('[data-policy-tab="mcp"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      const searchInput = container?.querySelector<HTMLInputElement>(
        '[data-policy-search="input"]'
      );
      if (searchInput) {
        setInputValue(searchInput, 'git');
      }
    });
    await flushEffects();

    const sharedMcpSection = container?.querySelector('[data-policy-section="shared-mcp"]');
    await act(async () => {
      sharedMcpSection
        ?.querySelector<HTMLButtonElement>('[data-policy-batch-action="block"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flushEffects();

    await act(async () => {
      container
        ?.querySelector<HTMLButtonElement>('[data-policy-action="save"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(handleSave).toHaveBeenCalledWith(
      expect.objectContaining({
        repoPath: '/repo',
        allowedCapabilityIds: ['legacy-skill:planner'],
        blockedCapabilityIds: [],
        allowedSharedMcpIds: [],
        blockedSharedMcpIds: ['shared:git'],
      }),
      expect.objectContaining({
        hash: 'hash-preview',
      })
    );
  });

  it('keeps a stable popup frame while the catalog is still loading', async () => {
    catalogList.mockReturnValue(new Promise<ClaudeCapabilityCatalog>(() => {}));
    previewResolve.mockResolvedValue({
      repoPath: '/repo',
      worktreePath: '/repo',
      allowedCapabilityIds: [],
      blockedCapabilityIds: [],
      allowedSharedMcpIds: [],
      blockedSharedMcpIds: [],
      allowedPersonalMcpIds: [],
      blockedPersonalMcpIds: [],
      capabilityProvenance: {},
      sharedMcpProvenance: {},
      personalMcpProvenance: {},
      hash: 'hash-preview',
      policyHash: 'hash-preview',
    });
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        claudePolicy: {
          catalog: {
            list: catalogList,
          },
          preview: {
            resolve: previewResolve,
          },
        },
      },
    });

    const { ClaudePolicyEditorDialog } = await import('../ClaudePolicyEditorDialog');

    await act(async () => {
      root?.render(
        React.createElement(ClaudePolicyEditorDialog, {
          open: true,
          onOpenChange: vi.fn(),
          scope: 'worktree',
          globalPolicy: null,
          repoPath: '/repo',
          repoName: 'repo',
          worktreePath: '/repo/worktrees/feature-a',
          worktreeName: 'feature-a',
          projectPolicy: null,
          worktreePolicy: null,
          onSave: vi.fn(),
        })
      );
    });
    await flushEffects();

    const popup = container?.querySelector<HTMLElement>('[data-testid="dialog-popup"]');
    const panel = container?.querySelector<HTMLElement>('[data-testid="dialog-panel"]');

    expect(container?.textContent).toContain('Loading skill and MCP catalog...');
    expect(popup?.dataset.policyDialog).toBe('editor');
    expect(popup?.className).toContain('h-[min(85vh,54rem)]');
    expect(panel?.className).toContain('flex-1');
    expect(panel?.className).toContain('min-h-0');
  });
});
