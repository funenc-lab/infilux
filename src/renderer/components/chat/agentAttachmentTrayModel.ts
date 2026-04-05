export type AgentAttachmentKind = 'image' | 'file';

export interface AgentAttachmentItem {
  id: string;
  kind: AgentAttachmentKind;
  name: string;
  path: string;
}

const IMAGE_EXTENSIONS = new Set([
  'apng',
  'avif',
  'bmp',
  'gif',
  'ico',
  'jpeg',
  'jpg',
  'png',
  'svg',
  'tif',
  'tiff',
  'webp',
]);

const IMAGE_SEND_DELAY_MS = 800;
const MULTILINE_SEND_DELAY_MS = 300;
const DEFAULT_SEND_DELAY_MS = 30;

function getFileName(filePath: string): string {
  const normalizedPath = filePath.replaceAll('\\', '/');
  const lastSeparatorIndex = normalizedPath.lastIndexOf('/');
  return lastSeparatorIndex >= 0 ? normalizedPath.slice(lastSeparatorIndex + 1) : normalizedPath;
}

function isImageAttachmentPath(filePath: string): boolean {
  const fileName = getFileName(filePath);
  const extensionIndex = fileName.lastIndexOf('.');
  if (extensionIndex < 0 || extensionIndex === fileName.length - 1) {
    return false;
  }

  return IMAGE_EXTENSIONS.has(fileName.slice(extensionIndex + 1).toLowerCase());
}

function createAgentAttachment(filePath: string): AgentAttachmentItem {
  return {
    id: filePath,
    kind: isImageAttachmentPath(filePath) ? 'image' : 'file',
    name: getFileName(filePath),
    path: filePath,
  };
}

function quoteAgentAttachmentPath(filePath: string): string {
  return `"${filePath.replaceAll('"', '\\"')}"`;
}

function toAgentAttachmentToken(attachment: AgentAttachmentItem): string {
  const serializedPath = /\s|"/.test(attachment.path)
    ? quoteAgentAttachmentPath(attachment.path)
    : attachment.path;

  if (attachment.kind === 'file') {
    return `@${serializedPath}`;
  }

  return serializedPath;
}

export function mergeAgentAttachments(
  currentAttachments: AgentAttachmentItem[],
  nextPaths: string[]
): AgentAttachmentItem[] {
  const merged = [...currentAttachments];
  const seenPaths = new Set(currentAttachments.map((attachment) => attachment.path));

  for (const nextPath of nextPaths) {
    if (!nextPath || seenPaths.has(nextPath)) {
      continue;
    }

    merged.push(createAgentAttachment(nextPath));
    seenPaths.add(nextPath);
  }

  return merged;
}

export function buildAgentAttachmentMessage(
  content: string,
  attachments: AgentAttachmentItem[]
): string {
  const trimmedContent = content.trim();
  const attachmentTokens = attachments.map(toAgentAttachmentToken).join(' ');

  if (trimmedContent && attachmentTokens) {
    return `${trimmedContent}\n\n${attachmentTokens}`;
  }

  return trimmedContent || attachmentTokens;
}

export function buildAgentAttachmentInsertText(attachments: AgentAttachmentItem[]): string {
  const attachmentTokens = buildAgentAttachmentMessage('', attachments);
  if (!attachmentTokens) {
    return '';
  }

  return ` ${attachmentTokens}`;
}

export function resolveAgentAttachmentSendDelay(
  message: string,
  attachments: AgentAttachmentItem[]
): number {
  if (attachments.some((attachment) => attachment.kind === 'image')) {
    return IMAGE_SEND_DELAY_MS;
  }

  if (message.includes('\n')) {
    return MULTILINE_SEND_DELAY_MS;
  }

  return DEFAULT_SEND_DELAY_MS;
}
