import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/i18n', () => ({
  useI18n: () => ({
    t: (value: string, vars?: Record<string, string | number>) => {
      if (!vars) return value;
      return Object.entries(vars).reduce(
        (result, [key, nextValue]) => result.replace(`{{${key}}}`, String(nextValue)),
        value
      );
    },
  }),
}));

import { AgentAttachmentTray } from '../AgentAttachmentTray';
import type { AgentAttachmentItem } from '../agentAttachmentTrayModel';

const attachments: AgentAttachmentItem[] = [
  {
    id: '/tmp/diagram.png',
    kind: 'image',
    name: 'diagram.png',
    path: '/tmp/diagram.png',
  },
  {
    id: 'docs/spec.md',
    kind: 'file',
    name: 'spec.md',
    path: 'docs/spec.md',
  },
];

describe('AgentAttachmentTray', () => {
  it('anchors the tray to the bottom-right corner', () => {
    const markup = renderToStaticMarkup(
      React.createElement(AgentAttachmentTray, {
        attachments,
        expanded: false,
        canSend: true,
        isProcessing: false,
        onExpandedChange: vi.fn(),
        onPickFiles: vi.fn(),
        onRemoveAttachment: vi.fn(),
        onClear: vi.fn(),
        onSend: vi.fn(),
      })
    );

    expect(markup).toContain('absolute bottom-3 right-3');
    expect(markup).not.toContain('left-1/2');
    expect(markup).not.toContain('-translate-x-1/2');
  });

  it('renders the collapsed counter without listing attachment rows', () => {
    const markup = renderToStaticMarkup(
      React.createElement(AgentAttachmentTray, {
        attachments,
        expanded: false,
        canSend: true,
        isProcessing: false,
        onExpandedChange: vi.fn(),
        onPickFiles: vi.fn(),
        onRemoveAttachment: vi.fn(),
        onClear: vi.fn(),
        onSend: vi.fn(),
      })
    );

    expect(markup).toContain('2 attachments');
    expect(markup).toContain('Open attachments');
    expect(markup).not.toContain('diagram.png');
    expect(markup).not.toContain('spec.md');
  });

  it('renders attachment rows and tray actions when expanded', () => {
    const markup = renderToStaticMarkup(
      React.createElement(AgentAttachmentTray, {
        attachments,
        expanded: true,
        canSend: true,
        primaryActionLabel: 'Send attachments',
        isProcessing: false,
        onExpandedChange: vi.fn(),
        onPickFiles: vi.fn(),
        onRemoveAttachment: vi.fn(),
        onClear: vi.fn(),
        onSend: vi.fn(),
      })
    );

    expect(markup).toContain('diagram.png');
    expect(markup).toContain('spec.md');
    expect(markup).toContain('Add files');
    expect(markup).toContain('Clear all');
    expect(markup).toContain('Send attachments');
  });

  it('supports a terminal-insert primary action label for native-input providers', () => {
    const markup = renderToStaticMarkup(
      React.createElement(AgentAttachmentTray, {
        attachments,
        expanded: true,
        canSend: true,
        primaryActionLabel: 'Insert attachments',
        isProcessing: false,
        onExpandedChange: vi.fn(),
        onPickFiles: vi.fn(),
        onRemoveAttachment: vi.fn(),
        onClear: vi.fn(),
        onSend: vi.fn(),
      })
    );

    expect(markup).toContain('Insert attachments');
    expect(markup).not.toContain('>Send attachments<');
  });

  it('marks the tray as busy while large attachments are being prepared', () => {
    const markup = renderToStaticMarkup(
      React.createElement(AgentAttachmentTray, {
        attachments,
        expanded: true,
        canSend: false,
        primaryActionLabel: 'Send attachments',
        isProcessing: true,
        onExpandedChange: vi.fn(),
        onPickFiles: vi.fn(),
        onRemoveAttachment: vi.fn(),
        onClear: vi.fn(),
        onSend: vi.fn(),
      })
    );

    expect(markup).toContain('aria-busy="true"');
  });
});
