import { lazy } from 'react';

export const DeferredMarkdownPreview = lazy(async () => {
  const { MarkdownPreview } = await import('./MarkdownPreview');
  return { default: MarkdownPreview };
});

export const DeferredPdfPreview = lazy(async () => {
  const { PdfPreview } = await import('./PdfPreview');
  return { default: PdfPreview };
});
