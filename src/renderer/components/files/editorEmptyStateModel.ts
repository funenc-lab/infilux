import type { TFunction } from '@/i18n';

export interface EditorEmptyStateDetail {
  label: string;
  value: string;
}

export interface EditorEmptyStateModel {
  eyebrow: string;
  title: string;
  description: string;
  chipLabel: string;
  chipTone: 'strong' | 'wait';
  details: EditorEmptyStateDetail[];
}

export function buildIdleEditorStateModel({
  isFileTreeCollapsed,
  t,
}: {
  isFileTreeCollapsed: boolean;
  t: TFunction;
}): EditorEmptyStateModel {
  return {
    eyebrow: t('Editor Workspace'),
    title: t('Open a file to start editing'),
    description: t(
      'Choose a file from the tree to load it into the editor, preview supported content, and keep your current worktree context visible.'
    ),
    chipLabel: isFileTreeCollapsed ? t('File Tree Hidden') : t('Awaiting File'),
    chipTone: 'wait',
    details: [
      { label: t('Status'), value: t('No file selected') },
      { label: t('Sidebar'), value: isFileTreeCollapsed ? t('Collapsed') : t('Visible') },
      { label: t('Supported Views'), value: t('Code, Markdown, images, and PDFs') },
      {
        label: t('Next Step'),
        value: isFileTreeCollapsed
          ? t('Show the file tree and choose a file')
          : t('Choose a file from the tree to load it here'),
      },
    ],
  };
}

export function buildUnsupportedEditorStateModel({
  displayPath,
  fileTitle,
  t,
}: {
  displayPath: string;
  fileTitle: string;
  t: TFunction;
}): EditorEmptyStateModel {
  return {
    eyebrow: t('Preview Unavailable'),
    title: t('This file cannot be rendered in the editor'),
    description: t(
      'Use another application to inspect this file, or switch to a supported file to keep editing in place.'
    ),
    chipLabel: t('Unsupported File'),
    chipTone: 'wait',
    details: [
      { label: t('File'), value: fileTitle },
      { label: t('Path'), value: displayPath },
      { label: t('Status'), value: t('Preview not available') },
      { label: t('Next Step'), value: t('Open the file externally or choose another file') },
    ],
  };
}
