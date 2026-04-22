/* @vitest-environment jsdom */

import type { LiveAgentSubagent } from '@shared/types';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

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
  isRefreshing: false,
  error: null as string | null,
}));

const sessionSubagentState = vi.hoisted(() => ({
  items: [] as LiveAgentSubagent[],
  isLoading: false,
}));

const platformState = vi.hoisted(() => ({
  value: 'linux' as 'darwin' | 'win32' | 'linux',
}));

const agentTerminalState = vi.hoisted(() => ({
  props: [] as Array<Record<string, unknown>>,
}));

vi.mock('lucide-react', () => {
  const icon = (props: Record<string, unknown>) => React.createElement('svg', props);
  return {
    Bot: icon,
    Check: icon,
    Clock3: icon,
    CornerDownRight: icon,
    LoaderCircle: icon,
    Pause: icon,
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

vi.mock('@/components/ui/activity-indicator', () => ({
  ActivityIndicator: ({ state, className }: { state: string; className?: string }) =>
    React.createElement('span', {
      'data-slot': 'activity-indicator',
      'data-state': state,
      className,
    }),
}));

vi.mock('@/hooks/useSubagentTranscript', () => ({
  useSubagentTranscript: () => transcriptState,
}));

vi.mock('@/hooks/useSessionSubagents', () => ({
  useSessionSubagents: () => sessionSubagentState,
}));

vi.mock('@/i18n', () => ({
  useI18n: () => ({
    t: (value: string) => value,
  }),
}));

vi.mock('@/lib/electronEnvironment', () => ({
  getRendererPlatform: () => platformState.value,
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

vi.mock('../AgentTerminal', () => ({
  AgentTerminal: (props: {
    readOnlyTranscript?: {
      entries: Array<{ text: string }>;
      identity?: string;
    } | null;
  }) => {
    agentTerminalState.props.push(props as Record<string, unknown>);
    const transcriptText =
      props.readOnlyTranscript?.entries.map((entry) => entry.text).join(' | ') ?? '';
    return React.createElement(
      'div',
      {
        'data-agent-terminal-mode': props.readOnlyTranscript ? 'transcript' : 'live',
        'data-transcript-entry-count': String(props.readOnlyTranscript?.entries.length ?? 0),
        'data-transcript-identity': props.readOnlyTranscript?.identity ?? '',
      },
      transcriptText
    );
  },
}));

import { SessionSubagentInspector } from '../agent-panel/SessionSubagentInspector';

function setViewport(width: number, height: number) {
  const currentWindow =
    typeof window === 'undefined'
      ? ({
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
        } as unknown as Window & typeof globalThis)
      : window;

  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    writable: true,
    value: currentWindow,
  });

  Object.defineProperty(currentWindow, 'innerWidth', {
    configurable: true,
    writable: true,
    value: width,
  });
  Object.defineProperty(currentWindow, 'innerHeight', {
    configurable: true,
    writable: true,
    value: height,
  });
}

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

function mountInspector(props: React.ComponentProps<typeof SessionSubagentInspector>) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);

  act(() => {
    root.render(React.createElement(SessionSubagentInspector, props));
  });

  return {
    container,
    unmount() {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

describe('SessionSubagentInspector', () => {
  beforeEach(() => {
    transcriptState.data = null;
    transcriptState.isLoading = false;
    transcriptState.isRefreshing = false;
    transcriptState.error = null;
    sessionSubagentState.items = [];
    sessionSubagentState.isLoading = false;
    platformState.value = 'linux';
    agentTerminalState.props = [];
    setViewport(1440, 900);
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('renders subagent tabs and transcript entries for supported sessions', () => {
    const supportedSubagents = [
      createSubagent(),
      createSubagent({
        id: 'subagent-2',
        threadId: 'child-thread-2',
        label: 'Reviewer 1',
        lastSeenAt: 11,
        status: 'waiting',
      }),
    ];
    sessionSubagentState.items = supportedSubagents;
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
        sessionCwd: '/repo/worktree',
        providerSessionId: 'root-thread-1',
        viewState: {
          kind: 'supported',
          provider: 'codex',
        },
        subagents: supportedSubagents,
        selectedThreadId: 'child-thread-2',
        onSelectThread: () => undefined,
        onClose: () => undefined,
      })
    );

    expect(markup).toContain('role="tablist"');
    expect(markup).toContain('role="dialog"');
    expect(markup).toContain('role="tabpanel"');
    expect(markup).toContain('fixed inset-0 z-50');
    expect(markup).toContain('no-drag');
    expect(markup).toContain('h-[50rem]');
    expect(markup).toContain('w-[82rem]');
    expect(markup).toContain('max-h-[calc(100vh-2rem)]');
    expect(markup).toContain('max-w-[calc(100vw-2rem)]');
    expect(markup).toContain('data-session-subagent-layout="wide"');
    expect(markup).toContain('data-session-subagent-platform="linux"');
    expect(markup).toContain('data-session-subagent-header-chrome="terminal"');
    expect(markup).toContain('data-agent-canvas-interactive-surface="true"');
    expect(markup).toContain('session://subagents');
    expect(markup).toContain('Codex Main');
    expect(markup).toContain('Transcript');
    expect(markup).toContain('Worker 1');
    expect(markup).toContain('Reviewer 1');
    expect(markup).toContain('data-slot="activity-indicator"');
    expect(markup).toContain('data-state="running"');
    expect(markup).toContain('data-state="waiting_input"');
    expect(markup).toContain('data-agent-terminal-mode="transcript"');
    expect(markup).toContain('data-transcript-entry-count="2"');
    expect(markup).toContain('Review the failing tests');
    expect(markup).toContain('I will inspect the test suite first.');
    expect(markup).not.toContain('/repo/worktree');
    expect(markup).not.toContain('Subagents captured for the current agent session.');
  });

  it('switches to darwin chrome and stacked layout on constrained windows', () => {
    platformState.value = 'darwin';
    setViewport(960, 700);

    const markup = renderToStaticMarkup(
      React.createElement(SessionSubagentInspector, {
        sessionName: 'Codex Main',
        agentLabel: 'Codex',
        viewState: {
          kind: 'supported',
          provider: 'codex',
        },
        subagents: [createSubagent()],
        selectedThreadId: 'child-thread-1',
        onSelectThread: () => undefined,
        onClose: () => undefined,
      })
    );

    expect(markup).toContain('data-session-subagent-layout="stacked"');
    expect(markup).toContain('data-session-subagent-platform="darwin"');
    expect(markup).toContain('data-session-subagent-header-chrome="darwin"');
    expect(markup).toContain('h-[44rem]');
    expect(markup).toContain('w-[62rem]');
    expect(markup).not.toContain('session://subagents');
  });

  it('renders an explicit unsupported state inside the floating inspector', () => {
    setViewport(1200, 820);

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

    expect(markup).toContain('data-session-subagent-layout="compact"');
    expect(markup).toContain('data-session-subagent-empty-state="unsupported"');
    expect(markup).toContain('Subagents are not available for this tool');
    expect(markup).toContain('Claude does not expose subagent tracking in Infilux yet.');
  });

  it('keeps transcript content mounted while a cached tab refresh is in flight', () => {
    sessionSubagentState.items = [createSubagent()];
    transcriptState.data = {
      threadId: 'child-thread-1',
      entries: [
        {
          id: 'entry-1',
          text: 'Cached transcript body',
          kind: 'message',
          role: 'assistant',
          timestamp: Date.parse('2026-04-21T10:00:00.000Z'),
        },
      ],
    };
    transcriptState.isLoading = false;
    transcriptState.isRefreshing = true;

    const markup = renderToStaticMarkup(
      React.createElement(SessionSubagentInspector, {
        sessionName: 'Codex Main',
        agentLabel: 'Codex',
        viewState: {
          kind: 'supported',
          provider: 'codex',
        },
        subagents: [createSubagent()],
        selectedThreadId: 'child-thread-1',
        onSelectThread: () => undefined,
        onClose: () => undefined,
      })
    );

    expect(markup).toContain('data-session-subagent-loading="refresh"');
    expect(markup).toContain('Cached transcript body');
    expect(markup).not.toContain('No transcript entries were found for this subagent.');
  });

  it('switches tabs and closes the inspector from pointer interactions', async () => {
    const supportedSubagents = [
      createSubagent(),
      createSubagent({
        id: 'subagent-2',
        threadId: 'child-thread-2',
        label: 'Reviewer 1',
        lastSeenAt: 11,
      }),
    ];
    sessionSubagentState.items = supportedSubagents;

    const onSelectThread = vi.fn();
    const onClose = vi.fn();
    const mounted = mountInspector({
      sessionName: 'Codex Main',
      agentLabel: 'Codex',
      sessionCwd: '/repo/worktree',
      providerSessionId: 'root-thread-1',
      viewState: {
        kind: 'supported',
        provider: 'codex',
      },
      subagents: supportedSubagents,
      selectedThreadId: 'child-thread-1',
      onSelectThread,
      onClose,
    });

    const reviewerTab = mounted.container.querySelector<HTMLButtonElement>(
      '#session-subagent-tab-child-thread-2'
    );
    const closeButton = mounted.container.querySelector<HTMLButtonElement>(
      'button[aria-label="Close subagent window"]'
    );

    expect(reviewerTab).not.toBeNull();
    expect(closeButton).not.toBeNull();

    await act(async () => {
      reviewerTab?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onSelectThread).toHaveBeenCalledWith('child-thread-2');

    await act(async () => {
      closeButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onClose).toHaveBeenCalledTimes(1);

    mounted.unmount();
  });
});
