/* @vitest-environment jsdom */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('lucide-react', () => ({
  BrainCircuit: (props: React.SVGProps<SVGSVGElement>) =>
    React.createElement('svg', { ...props, 'data-icon': 'ai-center' }),
}));

vi.mock('@/i18n', () => ({
  useI18n: () => ({
    t: (value: string) => value,
  }),
}));

vi.mock('../SidebarToolbarTooltip', () => ({
  SidebarToolbarTooltip: ({ label, children }: { label: string; children?: React.ReactNode }) =>
    React.createElement('span', { 'data-tooltip-label': label }, children as React.ReactNode),
}));

const mountedRoots: Root[] = [];

describe('SidebarAiCenterButton', () => {
  afterEach(() => {
    for (const root of mountedRoots.splice(0)) {
      act(() => {
        root.unmount();
      });
    }
    document.body.innerHTML = '';
  });

  it('routes to the AI center tab and exposes active sidebar state', async () => {
    const { SidebarAiCenterButton } = await import('../SidebarAiCenterButton');
    const onSelect = vi.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    mountedRoots.push(root);

    act(() => {
      root.render(React.createElement(SidebarAiCenterButton, { active: true, onSelect }));
    });

    const button = container.querySelector<HTMLButtonElement>('button[aria-label="AI Center"]');
    expect(button).not.toBeNull();
    expect(button?.getAttribute('aria-pressed')).toBe('true');
    expect(button?.getAttribute('data-state')).toBe('active');

    act(() => {
      button?.click();
    });

    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});
