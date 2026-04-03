import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('framer-motion', () => ({
  motion: {
    span: (props: React.HTMLAttributes<HTMLSpanElement>) => React.createElement('span', props),
  },
}));

vi.mock('@/i18n', () => ({
  useI18n: () => ({
    t: (value: string) => value,
  }),
}));

import { ActivityIndicator } from '../activity-indicator';

describe('ActivityIndicator', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('uses control-state colors instead of hardcoded tailwind semantic colors', () => {
    const runningMarkup = renderToStaticMarkup(
      React.createElement(ActivityIndicator, { state: 'running' })
    );
    const waitingMarkup = renderToStaticMarkup(
      React.createElement(ActivityIndicator, { state: 'waiting_input' })
    );
    const completedMarkup = renderToStaticMarkup(
      React.createElement(ActivityIndicator, { state: 'completed' })
    );

    expect(runningMarkup).toContain('bg-[color:var(--control-live)]');
    expect(waitingMarkup).toContain('bg-[color:var(--control-wait)]');
    expect(completedMarkup).toContain('bg-[color:var(--control-done)]');
    expect(runningMarkup).not.toContain('bg-green-500');
    expect(waitingMarkup).not.toContain('bg-amber-500');
    expect(completedMarkup).not.toContain('bg-blue-500');
  });

  it('renders a looping square-segment indicator for active execution states', () => {
    const runningMarkup = renderToStaticMarkup(
      React.createElement(ActivityIndicator, { state: 'running' })
    );
    const waitingMarkup = renderToStaticMarkup(
      React.createElement(ActivityIndicator, { state: 'waiting_input' })
    );
    const completedMarkup = renderToStaticMarkup(
      React.createElement(ActivityIndicator, { state: 'completed' })
    );

    expect(runningMarkup).toContain('data-slot="activity-indicator"');
    expect(runningMarkup).toContain('data-animated="true"');
    expect(runningMarkup).toContain('data-pattern="sequence"');
    expect(runningMarkup).toContain('rounded-[0.2rem]');
    expect(runningMarkup).not.toContain('rounded-full');
    expect(runningMarkup.match(/data-slot="activity-indicator-block"/g)?.length).toBe(2);

    expect(waitingMarkup).toContain('data-animated="true"');
    expect(waitingMarkup).toContain('data-pattern="pulse"');
    expect(waitingMarkup.match(/data-slot="activity-indicator-block"/g)?.length).toBe(1);

    expect(completedMarkup).toContain('data-animated="false"');
    expect(completedMarkup).toContain('data-pattern="static"');
    expect(completedMarkup.match(/data-slot="activity-indicator-block"/g)?.length).toBe(1);
  });

  it('renders execution states as compact signal bars instead of dot-like blocks', () => {
    const runningMarkup = renderToStaticMarkup(
      React.createElement(ActivityIndicator, { state: 'running' })
    );
    const waitingMarkup = renderToStaticMarkup(
      React.createElement(ActivityIndicator, { state: 'waiting_input' })
    );
    const completedMarkup = renderToStaticMarkup(
      React.createElement(ActivityIndicator, { state: 'completed' })
    );

    expect(runningMarkup.match(/h-2 w-3/g)?.length).toBe(2);
    expect(waitingMarkup).toContain('h-2 w-2.5');
    expect(completedMarkup).toContain('h-2 w-2.5');
    expect(runningMarkup).not.toContain('h-2 w-2 bg-[color:var(--control-live)]');
  });

  it('does not render anything for idle state', () => {
    expect(renderToStaticMarkup(React.createElement(ActivityIndicator, { state: 'idle' }))).toBe(
      ''
    );
  });
});
