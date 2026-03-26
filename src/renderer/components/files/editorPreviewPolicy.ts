import { isImageFile, isPdfFile } from './fileIcons';

export type MarkdownPreviewMode = 'off' | 'split' | 'fullscreen';

export function isMarkdownFile(path: string | null | undefined): boolean {
  if (!path) {
    return false;
  }

  const ext = path.split('.').pop()?.toLowerCase();
  return ext === 'md' || ext === 'markdown';
}

export function resolveEditorPreviewPolicy({
  activeTabPath,
  hasActiveTab,
  isUnsupported = false,
}: {
  activeTabPath: string | null;
  hasActiveTab: boolean;
  isUnsupported?: boolean;
}) {
  const isMarkdown = isMarkdownFile(activeTabPath);
  const isImage = isImageFile(activeTabPath);
  const isPdf = isPdfFile(activeTabPath);

  return {
    isMarkdown,
    isImage,
    isPdf,
    requiresMonaco: hasActiveTab && !isUnsupported && !isImage && !isPdf,
  };
}

export function resolveNextPreviewMode(
  currentMode: MarkdownPreviewMode,
  pendingPreviewMode: MarkdownPreviewMode | undefined,
  isMarkdown: boolean
): MarkdownPreviewMode {
  if (!pendingPreviewMode || !isMarkdown) {
    return currentMode;
  }

  return pendingPreviewMode;
}
