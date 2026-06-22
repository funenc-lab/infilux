/* @vitest-environment jsdom */

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { createAgentReplaySnapshotStore } from '../agentReplaySnapshotStore';
import { MAX_TRANSCRIPT_VISIBLE_LINE_LIMIT } from '../agentSessionTranscriptModel';

vi.mock('lucide-react', () => {
  const Icon = (props: React.SVGProps<SVGSVGElement>) => React.createElement('svg', props);
  return {
    ArrowDownToLine: Icon,
    Copy: Icon,
    Download: Icon,
    FileText: Icon,
    Search: Icon,
  };
});

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
  }) => React.createElement('button', { type: 'button', ...props }, children),
}));

vi.mock('@/components/ui/sheet', () => ({
  Sheet: ({ children, open }: { children: React.ReactNode; open?: boolean }) =>
    open === false ? null : React.createElement('section', { 'data-slot': 'sheet-root' }, children),
  SheetPopup: ({ children, className }: { children: React.ReactNode; className?: string }) =>
    React.createElement('div', { className, 'data-slot': 'sheet-popup' }, children),
  SheetHeader: ({ children, className }: { children: React.ReactNode; className?: string }) =>
    React.createElement('header', { className, 'data-slot': 'sheet-header' }, children),
  SheetTitle: ({ children, className }: { children: React.ReactNode; className?: string }) =>
    React.createElement('h2', { className, 'data-slot': 'sheet-title' }, children),
  SheetDescription: ({ children, className }: { children: React.ReactNode; className?: string }) =>
    React.createElement('p', { className, 'data-slot': 'sheet-description' }, children),
  SheetPanel: ({ children, className }: { children: React.ReactNode; className?: string }) =>
    React.createElement('div', { className, 'data-slot': 'sheet-panel' }, children),
  SheetFooter: ({ children, className }: { children: React.ReactNode; className?: string }) =>
    React.createElement('footer', { className, 'data-slot': 'sheet-footer' }, children),
}));

vi.mock('@/components/ui/toast', () => ({
  toastManager: {
    add: vi.fn(),
  },
}));

vi.mock('@/i18n', () => ({
  useI18n: () => ({
    t: (value: string, params?: Record<string, unknown>) => {
      if (!params) {
        return value;
      }
      return Object.entries(params).reduce(
        (text, [key, replacement]) => text.replace(`{{${key}}}`, String(replacement)),
        value
      );
    },
  }),
}));

vi.mock('@/lib/utils', () => ({
  cn: (...values: Array<string | false | null | undefined>) => values.filter(Boolean).join(' '),
}));

import { AgentSessionTranscriptDrawer } from '../AgentSessionTranscriptDrawer';

function buildRetainedSnapshot(lineCount: number): string {
  return Array.from(
    { length: lineCount },
    (_, index) => `retained-entry-${String(index + 1).padStart(4, '0')}`
  ).join('\n');
}

describe('AgentSessionTranscriptDrawer', () => {
  it('renders the latest retained terminal output in a bounded drawer', () => {
    const lineCount = MAX_TRANSCRIPT_VISIBLE_LINE_LIMIT + 2;
    const markup = renderToStaticMarkup(
      React.createElement(AgentSessionTranscriptDrawer, {
        open: true,
        session: {
          id: 'session-1',
          name: 'Codex Work',
          replaySnapshot: buildRetainedSnapshot(lineCount),
          replaySnapshotCapturedAt: Date.parse('2026-06-21T08:00:00.000Z'),
        },
        onOpenChange: () => undefined,
      })
    );

    expect(markup).toContain('Transcript');
    expect(markup).toContain('Codex Work');
    expect(markup).toContain('Latest retained output');
    expect(markup).toContain('Search terminal output');
    expect(markup).toContain('Copy');
    expect(markup).toContain('Export');
    expect(markup).toContain(`retained-entry-${String(lineCount).padStart(4, '0')}`);
    expect(markup).not.toContain('retained-entry-0001');
  });

  it('renders an empty retained history state', () => {
    const markup = renderToStaticMarkup(
      React.createElement(AgentSessionTranscriptDrawer, {
        open: true,
        session: {
          id: 'session-2',
          name: 'Idle Session',
          replaySnapshot: '',
        },
        onOpenChange: () => undefined,
      })
    );

    expect(markup).toContain('No retained terminal output yet');
    expect(markup).toContain('Run the session or wait for output before opening the transcript.');
  });

  it('prefers the latest live snapshot over the throttled session snapshot', () => {
    const replaySnapshotStore = createAgentReplaySnapshotStore();
    replaySnapshotStore.setSnapshot('session-3', {
      replaySnapshot: 'live latest output',
      replaySnapshotCapturedAt: Date.parse('2026-06-21T08:01:00.000Z'),
    });

    const markup = renderToStaticMarkup(
      React.createElement(AgentSessionTranscriptDrawer, {
        open: true,
        replaySnapshotStore,
        session: {
          id: 'session-3',
          name: 'Live Session',
          replaySnapshot: 'throttled older output',
          replaySnapshotCapturedAt: Date.parse('2026-06-21T08:00:00.000Z'),
        },
        onOpenChange: () => undefined,
      })
    );

    expect(markup).toContain('live latest output');
    expect(markup).not.toContain('throttled older output');
  });
});
