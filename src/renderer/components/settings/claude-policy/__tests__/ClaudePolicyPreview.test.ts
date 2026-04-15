/* @vitest-environment jsdom */

import type { ClaudeCapabilityCatalog, ResolvedClaudePolicy } from '@shared/types';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClaudePolicyPreview } from '../ClaudePolicyPreview';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('@/i18n', () => ({
  useI18n: () => ({
    t: (value: string, params?: Record<string, string | number>) => {
      if (!params) {
        return value;
      }
      return value.replace(/\{\{(\w+)\}\}/g, (match, token) => {
        const parameter = params[token];
        return parameter === undefined ? match : String(parameter);
      });
    },
  }),
}));

describe('ClaudePolicyPreview', () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
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
  });

  it('renders skill and MCP preview groups without surfacing command entries', async () => {
    const catalog: ClaudeCapabilityCatalog = {
      capabilities: [
        {
          id: 'command:build',
          kind: 'command',
          name: 'Build',
          sourceScope: 'project',
          sourcePath: '/repo/.claude/commands/build.md',
          isAvailable: true,
          isConfigurable: true,
        },
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
          id: 'command:test',
          kind: 'command',
          name: 'Test',
          sourceScope: 'project',
          sourcePath: '/repo/.claude/commands/test.md',
          isAvailable: true,
          isConfigurable: true,
        },
        {
          id: 'command:ship',
          kind: 'command',
          name: 'Ship',
          sourceScope: 'project',
          sourcePath: '/repo/.claude/commands/ship.md',
          isAvailable: true,
          isConfigurable: true,
        },
        {
          id: 'legacy-skill:planner',
          kind: 'legacy-skill',
          name: 'Planner',
          sourceScope: 'project',
          sourcePath: '/repo/.claude/skills/planner.md',
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
          id: 'shared:search',
          name: 'Search',
          scope: 'shared',
          sourceScope: 'project',
          sourcePath: '/repo/.mcp.json',
          transportType: 'stdio',
          isAvailable: true,
          isConfigurable: true,
        },
      ],
      personalMcpServers: [
        {
          id: 'personal:browser',
          name: 'Browser',
          scope: 'personal',
          sourceScope: 'user',
          sourcePath: '/Users/test/.claude/settings.json',
          transportType: 'stdio',
          isAvailable: true,
          isConfigurable: true,
        },
      ],
      generatedAt: 1,
    };

    const resolvedPolicy: ResolvedClaudePolicy = {
      repoPath: '/repo',
      worktreePath: '/repo',
      allowedCapabilityIds: [
        'command:build',
        'command:review',
        'command:test',
        'command:ship',
        'legacy-skill:planner',
      ],
      blockedCapabilityIds: [],
      allowedSharedMcpIds: ['shared:filesystem', 'shared:search'],
      blockedSharedMcpIds: [],
      allowedPersonalMcpIds: ['personal:browser'],
      blockedPersonalMcpIds: [],
      capabilityProvenance: {},
      sharedMcpProvenance: {},
      personalMcpProvenance: {},
      hash: 'preview-hash',
      policyHash: 'preview-hash',
    };

    await act(async () => {
      root?.render(
        React.createElement(ClaudePolicyPreview, {
          catalog,
          resolvedPolicy,
        })
      );
    });

    expect(container?.querySelector('[data-policy-preview-group="skills"]')?.textContent).toContain(
      'Planner'
    );
    expect(
      container?.querySelector('[data-policy-preview-group="skills"]')?.textContent
    ).not.toContain('Build');
    expect(
      container?.querySelector('[data-policy-preview-group="shared-mcp"]')?.textContent
    ).toContain('Search');
    expect(
      container?.querySelector('[data-policy-preview-group="personal-mcp"]')?.textContent
    ).toContain('Browser');
  });
});
