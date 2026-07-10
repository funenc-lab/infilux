/* @vitest-environment jsdom */

import React, { act, Suspense } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('../MarkdownPreview', () => ({
  MarkdownPreview: ({ content, filePath }: { content: string; filePath: string }) =>
    React.createElement('div', {
      'data-markdown-preview': `${filePath}:${content}`,
    }),
}));

vi.mock('../PdfPreview', () => ({
  PdfPreview: ({ path }: { path: string }) =>
    React.createElement('div', {
      'data-pdf-preview': path,
    }),
}));

describe('deferredPreviewComponents', () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root?.unmount();
      });
    }
    container?.remove();
    root = null;
    container = null;
  });

  it('loads the markdown renderer through a preview-specific boundary', async () => {
    const { DeferredMarkdownPreview } = await import('../deferredPreviewComponents');
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        React.createElement(
          Suspense,
          { fallback: React.createElement('div', { 'data-loading': 'markdown' }) },
          React.createElement(DeferredMarkdownPreview, {
            content: '# Notes',
            filePath: '/repo/notes.md',
          })
        )
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(
      container.querySelector('[data-markdown-preview="/repo/notes.md:# Notes"]')
    ).not.toBeNull();
  });

  it('loads the PDF renderer through a preview-specific boundary', async () => {
    const { DeferredPdfPreview } = await import('../deferredPreviewComponents');
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        React.createElement(
          Suspense,
          { fallback: React.createElement('div', { 'data-loading': 'pdf' }) },
          React.createElement(DeferredPdfPreview, {
            path: '/repo/spec.pdf',
          })
        )
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.querySelector('[data-pdf-preview="/repo/spec.pdf"]')).not.toBeNull();
  });
});
