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
    React.createElement('span', { id: 'token-prompt-cache' }, t('Prompt cache tokens')),
    React.createElement('span', { id: 'token-cached-input' }, t('Cached input tokens')),
    React.createElement('span', { id: 'token-fresh' }, t('Fresh scan')),
    React.createElement('span', { id: 'token-cached' }, t('Cached snapshot')),
    React.createElement('span', { id: 'token-refreshing-cache' }, t('Refreshing cached data')),
    React.createElement('span', { id: 'token-updated' }, t('Updated {{time}}', { time: '09:30' })),
    React.createElement('span', { id: 'token-empty-title' }, t('No token usage recorded')),
    React.createElement(
      'span',
      { id: 'token-empty-detail' },
      t('Open or refresh a supported agent session to populate this scope.')
    ),
    React.createElement('span', { id: 'token-provider' }, t('Provider Coverage')),
    React.createElement('span', { id: 'ai-center' }, t('AI Center')),
    React.createElement(
      'span',
      { id: 'cross-project-ai-orchestration' },
      t('Cross-project AI orchestration')
    ),
    React.createElement('span', { id: 'loading-ai-center' }, t('Loading AI Center')),
    React.createElement('span', { id: 'project-todo' }, t('Project Todo')),
    React.createElement('span', { id: 'current-project' }, t('Current project')),
    React.createElement('span', { id: 'no-project-selected' }, t('No project selected')),
    React.createElement('span', { id: 'task-board' }, t('Task board')),
    React.createElement('span', { id: 'unable-load-tasks' }, t('Unable to load tasks')),
    React.createElement('span', { id: 'ready-dispatch' }, t('Ready to Dispatch')),
    React.createElement('span', { id: 'running-now' }, t('Running Now')),
    React.createElement('span', { id: 'open' }, t('Open')),
    React.createElement('span', { id: 'paused' }, t('Paused')),
    React.createElement('span', { id: 'open-task' }, t('Open task')),
    React.createElement('span', { id: 'open-count' }, t('{{count}} open', { count: 3 })),
    React.createElement('span', { id: 'approve-task' }, t('Approve task')),
    React.createElement('span', { id: 'review-task' }, t('Review task')),
    React.createElement('span', { id: 'active-count' }, t('{{count}} active', { count: 2 })),
    React.createElement('span', { id: 'open-tasks' }, t('Open Tasks')),
    React.createElement('span', { id: 'approvals' }, t('Approvals'))
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
    expect(container.querySelector('#token-fresh')?.textContent).toBe('\u6700\u65b0\u626b\u63cf');
    expect(container.querySelector('#token-cached')?.textContent).toBe('\u7f13\u5b58\u5feb\u7167');
    expect(container.querySelector('#token-refreshing-cache')?.textContent).toBe(
      '\u6b63\u5728\u5237\u65b0\u7f13\u5b58\u6570\u636e'
    );
    expect(container.querySelector('#token-updated')?.textContent).toBe('\u66f4\u65b0\u4e8e 09:30');
    expect(container.querySelector('#token-empty-title')?.textContent).toBe(
      '\u6682\u65e0 token \u7528\u91cf\u8bb0\u5f55'
    );
    expect(container.querySelector('#token-empty-detail')?.textContent).toBe(
      '\u6253\u5f00\u6216\u5237\u65b0\u53d7\u652f\u6301\u7684 Agent \u4f1a\u8bdd\u4ee5\u586b\u5145\u5f53\u524d\u8303\u56f4\u3002'
    );
    expect(container.querySelector('#token-provider')?.textContent).toBe('Provider \u8986\u76d6');
    expect(container.querySelector('#ai-center')?.textContent).toBe('AI \u667a\u80fd\u4e2d\u5fc3');
    expect(container.querySelector('#cross-project-ai-orchestration')?.textContent).toBe(
      '\u8de8\u9879\u76ee AI \u7f16\u6392'
    );
    expect(container.querySelector('#loading-ai-center')?.textContent).toBe(
      '\u6b63\u5728\u52a0\u8f7d AI \u667a\u80fd\u4e2d\u5fc3'
    );
    expect(container.querySelector('#project-todo')?.textContent).toBe('\u9879\u76ee\u5f85\u529e');
    expect(container.querySelector('#current-project')?.textContent).toBe(
      '\u5f53\u524d\u9879\u76ee'
    );
    expect(container.querySelector('#no-project-selected')?.textContent).toBe(
      '\u672a\u9009\u62e9\u9879\u76ee'
    );
    expect(container.querySelector('#task-board')?.textContent).toBe('\u4efb\u52a1\u770b\u677f');
    expect(container.querySelector('#unable-load-tasks')?.textContent).toBe(
      '\u65e0\u6cd5\u52a0\u8f7d\u4efb\u52a1'
    );
    expect(container.querySelector('#ready-dispatch')?.textContent).toBe('\u53ef\u6d3e\u53d1');
    expect(container.querySelector('#running-now')?.textContent).toBe('\u6b63\u5728\u6267\u884c');
    expect(container.querySelector('#open')?.textContent).toBe('\u6253\u5f00');
    expect(container.querySelector('#paused')?.textContent).toBe('\u5df2\u6682\u505c');
    expect(container.querySelector('#open-task')?.textContent).toBe('\u6253\u5f00\u4efb\u52a1');
    expect(container.querySelector('#open-count')?.textContent).toBe('3 \u4e2a\u672a\u5b8c\u6210');
    expect(container.querySelector('#approve-task')?.textContent).toBe('\u6279\u51c6\u4efb\u52a1');
    expect(container.querySelector('#review-task')?.textContent).toBe('\u67e5\u770b\u4efb\u52a1');
    expect(container.querySelector('#active-count')?.textContent).toBe('2 \u4e2a\u6d3b\u52a8');
    expect(container.querySelector('#open-tasks')?.textContent).toBe(
      '\u672a\u5b8c\u6210\u4efb\u52a1'
    );
    expect(container.querySelector('#approvals')?.textContent).toBe('\u5ba1\u6279');
  });
});
