import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/i18n', () => ({
  useI18n: () => ({
    t: (value: string) => value,
  }),
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    variant: _variant,
    size: _size,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    children?: React.ReactNode;
    variant?: string;
    size?: string;
  }) => React.createElement('button', { type: 'button', ...props }, children as React.ReactNode),
}));

vi.mock('@/components/layout/ConsoleEmptyState', () => ({
  ConsoleEmptyState: ({
    title,
    description,
    actions,
    details,
    chips,
  }: {
    title: string;
    description: string;
    actions?: React.ReactNode;
    details?: Array<{ label: string; value: string }>;
    chips?: Array<{ label: string }>;
  }) =>
    React.createElement(
      'section',
      { 'data-component': 'ConsoleEmptyState' },
      React.createElement('h2', null, title),
      React.createElement('p', null, description),
      React.createElement(
        'div',
        { 'data-slot': 'chips' },
        chips?.map((chip) => React.createElement('span', { key: chip.label }, chip.label))
      ),
      React.createElement(
        'dl',
        { 'data-slot': 'details' },
        details?.map((detail) =>
          React.createElement(
            'div',
            { key: detail.label },
            React.createElement('dt', null, detail.label),
            React.createElement('dd', null, detail.value)
          )
        )
      ),
      actions ?? null
    ),
}));

import { AgentGroupEmptyState } from '../AgentGroupEmptyState';

describe('AgentGroupEmptyState', () => {
  const agentSettings = {
    codex: { enabled: true, isDefault: false },
    claude: { enabled: true, isDefault: true },
  };

  const agentInfo = {
    claude: { name: 'Claude', command: 'claude' },
    codex: { name: 'Codex', command: 'codex' },
  };

  it('renders the operational empty state copy and actions', () => {
    const markup = renderToStaticMarkup(
      React.createElement(AgentGroupEmptyState, {
        menuRef: { current: null },
        showAgentMenu: false,
        enabledAgents: ['codex', 'claude'],
        customAgents: [],
        agentSettings,
        agentInfo,
        onOpenLaunchOptions: () => undefined,
        onSessionNew: () => undefined,
        onSessionNewWithAgent: () => undefined,
        onToggleAgentMenu: () => undefined,
      })
    );

    expect(markup).toContain('No sessions in this agent group');
    expect(markup).toContain('Awaiting Session');
    expect(markup).toContain('Profiles Ready');
    expect(markup).toContain('New Session');
    expect(markup).toContain('Choose session agent');
    expect(markup).not.toContain('Select Agent');
  });

  it('renders the agent picker with the default profile first when open', () => {
    const markup = renderToStaticMarkup(
      React.createElement(AgentGroupEmptyState, {
        menuRef: { current: null },
        showAgentMenu: true,
        enabledAgents: ['codex', 'claude'],
        customAgents: [],
        agentSettings,
        agentInfo,
        onOpenLaunchOptions: () => undefined,
        onSessionNew: () => undefined,
        onSessionNewWithAgent: () => undefined,
        onToggleAgentMenu: () => undefined,
      })
    );

    expect(markup).toContain('Select Agent');
    expect(markup).toContain('Default');
    expect(markup.indexOf('Claude')).toBeLessThan(markup.indexOf('Codex'));
  });
});
