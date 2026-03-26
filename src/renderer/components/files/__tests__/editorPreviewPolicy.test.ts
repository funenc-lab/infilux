import { describe, expect, it } from 'vitest';
import {
  type MarkdownPreviewMode,
  resolveEditorPreviewPolicy,
  resolveNextPreviewMode,
} from '../editorPreviewPolicy';

describe('editorPreviewPolicy', () => {
  it('detects markdown, image, and pdf preview capabilities from the active path', () => {
    expect(
      resolveEditorPreviewPolicy({ activeTabPath: '/repo/readme.MD', hasActiveTab: true })
    ).toMatchObject({
      isMarkdown: true,
      isImage: false,
      isPdf: false,
      requiresMonaco: true,
    });

    expect(
      resolveEditorPreviewPolicy({ activeTabPath: '/repo/logo.svg', hasActiveTab: true })
    ).toMatchObject({
      isMarkdown: false,
      isImage: true,
      isPdf: false,
      requiresMonaco: false,
    });

    expect(
      resolveEditorPreviewPolicy({ activeTabPath: '/repo/spec.PDF', hasActiveTab: true })
    ).toMatchObject({
      isMarkdown: false,
      isImage: false,
      isPdf: true,
      requiresMonaco: false,
    });
  });

  it('disables monaco when there is no active tab or the file is unsupported', () => {
    expect(
      resolveEditorPreviewPolicy({
        activeTabPath: '/repo/readme.md',
        hasActiveTab: false,
      }).requiresMonaco
    ).toBe(false);

    expect(
      resolveEditorPreviewPolicy({
        activeTabPath: '/repo/data.bin',
        hasActiveTab: true,
        isUnsupported: true,
      }).requiresMonaco
    ).toBe(false);
  });

  it('only applies pending preview mode for markdown files', () => {
    const currentMode: MarkdownPreviewMode = 'off';

    expect(resolveNextPreviewMode(currentMode, 'split', true)).toBe('split');
    expect(resolveNextPreviewMode('fullscreen', 'split', false)).toBe('fullscreen');
    expect(resolveNextPreviewMode(currentMode, undefined, true)).toBe('off');
  });
});
