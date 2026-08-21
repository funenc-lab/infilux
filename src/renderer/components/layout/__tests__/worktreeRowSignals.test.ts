import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  buildWorktreeActivitySummary,
  buildWorktreeInlineItems,
  formatCompactDiffStat,
} from '../worktreeRowSignals';

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

  it('compacts large diff counts without losing their magnitude', () => {
    expect(formatCompactDiffStat(999)).toBe('999');
    expect(formatCompactDiffStat(1000)).toBe('1k');
    expect(formatCompactDiffStat(1234)).toBe('1.2k');
    expect(formatCompactDiffStat(26272)).toBe('26.3k');
    expect(formatCompactDiffStat(1_000_000)).toBe('1m');
  });

  it('renders compact diff counts inside the inline signal', () => {
    const items = buildWorktreeInlineItems({
      t,
      isMain: false,
      isPrunable: false,
      isMerged: false,
      diffStats: { insertions: 26272, deletions: 1234 },
      ahead: 0,
      behind: 0,
      activity: { agentCount: 0, terminalCount: 0 },
      hasCompletedTaskNotice: false,
    });

    const markup = renderToStaticMarkup(items[0].content);
    expect(markup).toContain('+26.3k');
    expect(markup).toContain('-1.2k');
  });
});
