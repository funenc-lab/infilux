import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { buildWorktreeActivitySummary, buildWorktreeInlineItems } from '../worktreeRowSignals';

const t = (value: string) => value;

describe('worktree row signals', () => {
  it('keeps agent and terminal activity as separate inline counters', () => {
    const items = buildWorktreeInlineItems({
      t,
      isMain: false,
      isPrunable: false,
      isMerged: false,
      diffStats: { insertions: 0, deletions: 0 },
      ahead: 0,
      behind: 0,
      activity: { agentCount: 2, terminalCount: 3 },
      hasCompletedTaskNotice: false,
    });

    expect(items.map((item) => item.key)).toEqual(['agents', 'terminals']);

    const markup = renderToStaticMarkup(
      items.map((item) => createElement('span', { key: item.key }, item.content))
    );
    expect(markup).toContain('data-kind="agents"');
    expect(markup).toContain('data-kind="terminals"');
    expect(markup).toContain('title="2 agents"');
    expect(markup).toContain('title="3 terminals"');
  });

  it('orders git decision signals before runtime counters', () => {
    const items = buildWorktreeInlineItems({
      t,
      isMain: false,
      isPrunable: false,
      isMerged: false,
      diffStats: { insertions: 4, deletions: 1 },
      ahead: 2,
      behind: 1,
      activity: { agentCount: 1, terminalCount: 1 },
      hasCompletedTaskNotice: true,
    });

    expect(items.map((item) => item.key)).toEqual([
      'diff',
      'sync',
      'agents',
      'terminals',
      'completed',
    ]);
  });

  it('keeps diff and sync signals ahead of branch context flags', () => {
    const items = buildWorktreeInlineItems({
      t,
      isMain: true,
      isPrunable: false,
      isMerged: false,
      diffStats: { insertions: 4, deletions: 1 },
      ahead: 2,
      behind: 1,
      activity: { agentCount: 0, terminalCount: 0 },
      hasCompletedTaskNotice: false,
    });

    expect(items.map((item) => item.key)).toEqual(['diff', 'sync', 'main']);
  });

  it('keeps the compact combined activity summary available for shared copy', () => {
    expect(buildWorktreeActivitySummary({ agentCount: 2, terminalCount: 3 }, t)).toBe(
      '2 agents · 3 terminals'
    );
  });
});
