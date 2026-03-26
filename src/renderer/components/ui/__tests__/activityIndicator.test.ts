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

  it('does not render anything for idle state', () => {
    expect(renderToStaticMarkup(React.createElement(ActivityIndicator, { state: 'idle' }))).toBe(
      ''
    );
  });
});
