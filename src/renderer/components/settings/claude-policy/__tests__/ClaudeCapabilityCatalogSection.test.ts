/* @vitest-environment jsdom */

import type { ClaudeCapabilityCatalog, ResolveClaudePolicyPreviewResult } from '@shared/types';
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

vi.mock('@/App/storage', () => ({
  getClaudeGlobalPolicy: () => null,
  saveClaudeGlobalPolicy: vi.fn(),
}));

vi.mock('@/components/settings/claude-policy/ClaudePolicyEditorDialog', () => ({
  ClaudePolicyEditorDialog: () => null,
}));

const catalogList =
  vi.fn<
    (request?: { repoPath?: string; worktreePath?: string }) => Promise<ClaudeCapabilityCatalog>
  >();
const previewResolve = vi.fn<() => Promise<ResolveClaudePolicyPreviewResult>>();

function installElectronApi(
  catalog: ClaudeCapabilityCatalog,
  preview: ResolveClaudePolicyPreviewResult
) {
  catalogList.mockResolvedValue(catalog);
  previewResolve.mockResolvedValue(preview);
  vi.stubGlobal('window', {
    ...window,
    electronAPI: {
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

describe('ClaudeCapabilityCatalogSection', () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    catalogList.mockReset();
    previewResolve.mockReset();
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

  it('renders only skill and MCP catalog sections and keeps the catalog read only', async () => {
    installElectronApi(
      {
        capabilities: [
          {
            id: 'command:review',
            kind: 'command',
            name: 'Review',
            description: 'Run the review flow',
            sourceScope: 'project',
            sourcePath: '/repo/.claude/commands/review.md',
            isAvailable: true,
            isConfigurable: true,
          },
          {
            id: 'legacy-skill:planner',
            kind: 'legacy-skill',
            name: 'Planner',
            description: 'Plan a feature',
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
        repoPath: '',
        worktreePath: '',
        allowedCapabilityIds: ['command:review', 'legacy-skill:planner'],
        blockedCapabilityIds: [],
        allowedSharedMcpIds: ['shared:filesystem'],
        blockedSharedMcpIds: [],
        allowedPersonalMcpIds: [],
        blockedPersonalMcpIds: [],
        capabilityProvenance: {},
        sharedMcpProvenance: {},
        personalMcpProvenance: {},
        hash: 'preview-hash',
        policyHash: 'preview-hash',
      }
    );

    const { ClaudeCapabilityCatalogSection } = await import('../ClaudeCapabilityCatalogSection');

    await act(async () => {
      root?.render(React.createElement(ClaudeCapabilityCatalogSection, { repoPath: '/repo' }));
    });
    await flushEffects();

    expect(catalogList).toHaveBeenCalledTimes(1);
    expect(catalogList).toHaveBeenCalledWith({
      repoPath: '/repo',
      worktreePath: '/repo',
    });
    expect(container?.textContent).toContain('Skill & MCP Catalog');
    expect(container?.textContent).toContain('Planner');
    expect(container?.textContent).toContain('2 sources');
    expect(container?.textContent).toContain('Skills');
    expect(container?.querySelector('[data-catalog-tab="skills"]')).not.toBeNull();
    expect(container?.querySelector('[data-catalog-tab="mcp"]')).not.toBeNull();
    expect(container?.textContent).toContain('Filesystem');
    expect(container?.textContent).toContain('Read only');
    expect(container?.textContent).not.toContain('Run the review flow');
    expect(container?.textContent).not.toContain('Capabilities');
    expect(container?.querySelector('[data-catalog-section="capabilities"]')).toBeNull();
    expect(container?.textContent).not.toContain('/repo/.claude/commands/review.md');

    await act(async () => {
      container
        ?.querySelector<HTMLButtonElement>(
          '[data-catalog-source-paths-trigger="legacy-skill:planner"]'
        )
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flushEffects();

    expect(container?.textContent).toContain('/repo/.agents/skills/planner/SKILL.md');
    expect(container?.textContent).toContain('/repo/.codex/skills/planner/SKILL.md');
    expect(container?.querySelector('[data-catalog-section="skills"]')).not.toBeNull();
    expect(container?.querySelector('[data-catalog-section="shared-mcp"]')).toBeNull();
    expect(container?.querySelector('[data-catalog-section="personal-mcp"]')).toBeNull();
    expect(container?.querySelector('[data-policy-preview-group="skills"]')).not.toBeNull();
    expect(container?.querySelector('[data-policy-preview-group="shared-mcp"]')).not.toBeNull();
    expect(container?.querySelector('[data-policy-decision]')).toBeNull();
    expect(container?.textContent).not.toContain('Save');

    await act(async () => {
      const searchInput = container?.querySelector<HTMLInputElement>(
        '[data-catalog-search="input"]'
      );
      if (searchInput) {
        searchInput.value = '.codex/skills/planner';
        searchInput.dispatchEvent(new Event('input', { bubbles: true }));
        searchInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
      container
        ?.querySelector<HTMLButtonElement>('[data-catalog-tab="mcp"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flushEffects();

    expect(container?.querySelector('[data-catalog-section="skills"]')).toBeNull();
    expect(container?.querySelector('[data-catalog-section="shared-mcp"]')).not.toBeNull();
    expect(container?.querySelector('[data-catalog-section="personal-mcp"]')).not.toBeNull();
    expect(container?.textContent).toContain('Filesystem');

    await act(async () => {
      container
        ?.querySelector<HTMLButtonElement>('[data-catalog-tab="skills"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flushEffects();

    expect(
      container?.querySelector('[data-catalog-item-id="legacy-skill:planner"]')
    ).not.toBeNull();
  });
});
