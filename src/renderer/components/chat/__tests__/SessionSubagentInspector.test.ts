import type { LiveAgentSubagent } from '@shared/types';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const transcriptState = vi.hoisted(() => ({
  data: null as null | {
    entries: Array<{
      id: string;
      text: string;
      kind: 'message' | 'tool_call';
      role: 'assistant' | 'developer' | 'user';
      timestamp: number;
      toolName?: string;
      phase?: string;
    }>;
    threadId?: string;
    truncated?: boolean;
  },
  isLoading: false,
  error: null as string | null,
}));

vi.mock('lucide-react', () => {
  const icon = (props: Record<string, unknown>) => React.createElement('svg', props);
  return {
    Bot: icon,
    CornerDownRight: icon,
    TerminalSquare: icon,
    User: icon,
    X: icon,
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
  }) => React.createElement('button', { type: 'button', ...props }, children as React.ReactNode),
}));

vi.mock('@/hooks/useSubagentTranscript', () => ({
  useSubagentTranscript: () => transcriptState,
}));

vi.mock('@/i18n', () => ({
  useI18n: () => ({
    t: (value: string) => value,
  }),
}));

vi.mock('@/lib/utils', () => ({
  cn: (...values: Array<string | false | null | undefined>) => values.filter(Boolean).join(' '),
}));

vi.mock('@/lib/worktreeAgentSummary', () => ({
  getSubagentStatusPresentation: () => ({
    label: 'Running',
    dotClassName: 'dot-running',
    badgeClassName: 'badge-running',
    buttonClassName: 'button-running',
  }),
}));

import { SessionSubagentInspector } from '../agent-panel/SessionSubagentInspector';

function createSubagent(overrides: Partial<LiveAgentSubagent> = {}): LiveAgentSubagent {
  return {
    id: 'subagent-1',
    provider: 'codex',
    threadId: 'child-thread-1',
    rootThreadId: 'root-thread-1',
    parentThreadId: 'root-thread-1',
    cwd: '/repo/worktree',
    label: 'Worker 1',
    lastSeenAt: 10,
    status: 'running',
    ...overrides,
  };
}

describe('SessionSubagentInspector', () => {
  beforeEach(() => {
    transcriptState.data = null;
    transcriptState.isLoading = false;
    transcriptState.error = null;
  });

  it('renders subagent tabs and transcript entries for supported sessions', () => {
    transcriptState.data = {
      threadId: 'child-thread-2',
      entries: [
        {
          id: 'entry-1',
          text: 'Review the failing tests',
          kind: 'message',
          role: 'user',
          timestamp: Date.parse('2026-04-21T10:00:00.000Z'),
        },
        {
          id: 'entry-2',
          text: 'I will inspect the test suite first.',
          kind: 'message',
          role: 'assistant',
          phase: 'commentary',
          timestamp: Date.parse('2026-04-21T10:00:01.000Z'),
        },
      ],
    };

    const markup = renderToStaticMarkup(
      React.createElement(SessionSubagentInspector, {
        sessionName: 'Codex Main',
        agentLabel: 'Codex',
        viewState: {
          kind: 'supported',
          provider: 'codex',
        },
        subagents: [
          createSubagent(),
          createSubagent({
            id: 'subagent-2',
            threadId: 'child-thread-2',
            label: 'Reviewer 1',
            lastSeenAt: 11,
          }),
        ],
        selectedThreadId: 'child-thread-2',
        onSelectThread: () => undefined,
        onClose: () => undefined,
      })
    );

    expect(markup).toContain('role="tablist"');
    expect(markup).toContain('Codex Main');
    expect(markup).toContain('Worker 1');
    expect(markup).toContain('Reviewer 1');
    expect(markup).toContain('Review the failing tests');
    expect(markup).toContain('I will inspect the test suite first.');
  });

  it('renders an explicit unsupported state inside the floating inspector', () => {
    const markup = renderToStaticMarkup(
      React.createElement(SessionSubagentInspector, {
        sessionName: 'Claude Main',
        agentLabel: 'Claude',
        viewState: {
          kind: 'unsupported',
          reason: 'provider-not-supported',
        },
        subagents: [],
        selectedThreadId: null,
        onSelectThread: () => undefined,
        onClose: () => undefined,
      })
    );

    expect(markup).toContain('data-session-subagent-empty-state="unsupported"');
    expect(markup).toContain('Subagents are not available for this tool');
    expect(markup).toContain('Claude does not expose subagent tracking in Infilux yet.');
  });
});
