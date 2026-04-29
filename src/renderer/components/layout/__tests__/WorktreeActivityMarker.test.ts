import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { WorktreeActivityMarker } from '../WorktreeActivityMarker';

describe('WorktreeActivityMarker', () => {
  it('renders a state-specific marker with accessible labels and no visible text', () => {
    const markup = renderToStaticMarkup(
      React.createElement(WorktreeActivityMarker, { state: 'running' })
    );

    expect(markup).toContain('aria-label="Running"');
    expect(markup).toContain('title="Running"');
    expect(markup).toContain('control-tree-state-marker');
    expect(markup).toContain('data-state="running"');
    expect(markup).not.toContain('>Running<');
  });

  it('does not render anything for the idle state', () => {
    const markup = renderToStaticMarkup(
      React.createElement(WorktreeActivityMarker, { state: 'idle' })
    );

    expect(markup).toBe('');
  });
});
