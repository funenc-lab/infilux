import { describe, expect, it } from 'vitest';
import {
  buildIdleEditorStateModel,
  buildUnsupportedEditorStateModel,
} from '../editorEmptyStateModel';

describe('buildIdleEditorStateModel', () => {
  it('surfaces file-tree recovery guidance when the sidebar is collapsed', () => {
    const t = (key: string) => key;

    const model = buildIdleEditorStateModel({
      isFileTreeCollapsed: true,
      t,
    });

    expect(model.eyebrow).toBe('Editor Workspace');
    expect(model.title).toBe('Open a file to start editing');
    expect(model.chipLabel).toBe('File Tree Hidden');
    expect(model.chipTone).toBe('wait');
    expect(model.details).toContainEqual({ label: 'Sidebar', value: 'Collapsed' });
    expect(model.details).toContainEqual({
      label: 'Next Step',
      value: 'Show the file tree and choose a file',
    });
  });

  it('keeps the default guidance concise when the sidebar is already visible', () => {
    const t = (key: string) => key;

    const model = buildIdleEditorStateModel({
      isFileTreeCollapsed: false,
      t,
    });

    expect(model.chipLabel).toBe('Awaiting File');
    expect(model.details).toContainEqual({ label: 'Sidebar', value: 'Visible' });
    expect(model.details).toContainEqual({
      label: 'Next Step',
      value: 'Choose a file from the tree to load it here',
    });
  });
});

describe('buildUnsupportedEditorStateModel', () => {
  it('captures the unsupported file metadata for the editor console state', () => {
    const t = (key: string) => key;

    const model = buildUnsupportedEditorStateModel({
      displayPath: 'assets/archive.bin',
      fileTitle: 'archive.bin',
      t,
    });

    expect(model.eyebrow).toBe('Preview Unavailable');
    expect(model.title).toBe('This file cannot be rendered in the editor');
    expect(model.chipLabel).toBe('Unsupported File');
    expect(model.details).toContainEqual({ label: 'File', value: 'archive.bin' });
    expect(model.details).toContainEqual({ label: 'Path', value: 'assets/archive.bin' });
    expect(model.details).toContainEqual({
      label: 'Next Step',
      value: 'Open the file externally or choose another file',
    });
  });
});
