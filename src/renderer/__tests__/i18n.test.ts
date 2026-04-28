/* @vitest-environment jsdom */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useI18n } from '@/i18n';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('@/stores/settings', () => ({
  useSettingsStore: (selector: (state: { language: string }) => unknown) =>
    selector({ language: 'zh' }),
}));

function TranslationProbe() {
  const { t } = useI18n();

  return React.createElement(
    'div',
    null,
    React.createElement('span', { id: 'duration' }, t('{{count}} minutes', { count: 5 })),
    React.createElement('span', { id: 'task' }, t('Task: {{title}}', { title: 'Fix API' })),
    React.createElement('span', { id: 'auto-reason' }, t('Task agent selection')),
    React.createElement('span', { id: 'blocked' }, t('Blocked')),
    React.createElement('span', { id: 'dependency' }, t('Waiting for dependency')),
    React.createElement('span', { id: 'task-count' }, t('{{count}} tasks', { count: 4 })),
    React.createElement('span', { id: 'empty-task' }, t('No tasks yet')),
    React.createElement(
      'span',
      { id: 'empty-help' },
      t('Generate tasks from a work request, or create one manually.')
    ),
    React.createElement(
      'span',
      { id: 'completion' },
      t('Completion {{percent}}%', { percent: 25 })
    ),
    React.createElement('span', { id: 'plan' }, t('Plan')),
    React.createElement(
      'span',
      { id: 'new-session' },
      t('New Session in {{name}}', { name: 'app' })
    ),
    React.createElement('span', { id: 'relative-time' }, t('{{count}}m ago', { count: 3 })),
    React.createElement('span', { id: 'token-scope' }, t('Project Scope')),
    React.createElement('span', { id: 'token-analytics' }, t('Token Analytics')),
    React.createElement(
      'span',
      { id: 'token-breakdown' },
      t('Break down input, output, cache, and reasoning tokens by project and provider.')
    ),
    React.createElement('span', { id: 'token' }, t('Refresh token usage')),
    React.createElement('span', { id: 'token-refreshing' }, t('Refreshing token usage')),
    React.createElement('span', { id: 'token-scan' }, t('Scanning token usage...')),
    React.createElement('span', { id: 'token-input' }, t('Input tokens')),
    React.createElement('span', { id: 'token-provider' }, t('Provider Coverage'))
  );
}

describe('renderer i18n', () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  afterEach(async () => {
    if (root && container) {
      const mountedRoot = root;
      await act(async () => {
        mountedRoot.unmount();
      });
      container.remove();
    }
    root = null;
    container = null;
  });

  it('keeps escaped zh templates parameterized', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(React.createElement(TranslationProbe));
    });

    expect(container.querySelector('#duration')?.textContent).toBe('5 \u5206\u949f');
    expect(container.querySelector('#task')?.textContent).toBe('\u4efb\u52a1\uff1aFix API');
    expect(container.querySelector('#auto-reason')?.textContent).toBe(
      '\u4efb\u52a1\u6307\u5b9a Agent'
    );
    expect(container.querySelector('#blocked')?.textContent).toBe('\u963b\u585e');
    expect(container.querySelector('#dependency')?.textContent).toBe('\u7b49\u5f85\u4f9d\u8d56');
    expect(container.querySelector('#task-count')?.textContent).toBe('4 \u4e2a\u4efb\u52a1');
    expect(container.querySelector('#empty-task')?.textContent).toBe('\u6682\u65e0\u4efb\u52a1');
    expect(container.querySelector('#empty-help')?.textContent).toBe(
      '\u6839\u636e\u5de5\u4f5c\u9700\u6c42\u751f\u6210\u4efb\u52a1\uff0c\u6216\u624b\u52a8\u521b\u5efa\u4e00\u4e2a\u4efb\u52a1\u3002'
    );
    expect(container.querySelector('#completion')?.textContent).toBe('\u5b8c\u6210\u7387 25%');
    expect(container.querySelector('#plan')?.textContent).toBe('\u8ba1\u5212');
    expect(container.querySelector('#new-session')?.textContent).toBe(
      '\u5728 app \u65b0\u5efa Session'
    );
    expect(container.querySelector('#relative-time')?.textContent).toBe('3 \u5206\u949f\u524d');
    expect(container.querySelector('#token-scope')?.textContent).toBe('\u9879\u76ee\u7ef4\u5ea6');
    expect(container.querySelector('#token-analytics')?.textContent).toBe('Token \u7edf\u8ba1');
    expect(container.querySelector('#token-breakdown')?.textContent).toBe(
      '\u6309\u9879\u76ee\u4e0e provider \u6c47\u603b\u8f93\u5165\u3001\u8f93\u51fa\u3001\u7f13\u5b58\u548c\u63a8\u7406 token\u3002'
    );
    expect(container.querySelector('#token')?.textContent).toBe('\u5237\u65b0 token \u7528\u91cf');
    expect(container.querySelector('#token-refreshing')?.textContent).toBe(
      '\u6b63\u5728\u5237\u65b0 token \u7528\u91cf'
    );
    expect(container.querySelector('#token-scan')?.textContent).toBe(
      '\u6b63\u5728\u626b\u63cf token \u7528\u91cf...'
    );
    expect(container.querySelector('#token-input')?.textContent).toBe('\u8f93\u5165 token');
    expect(container.querySelector('#token-provider')?.textContent).toBe('Provider \u8986\u76d6');
  });
});
