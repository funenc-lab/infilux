import { type AgentAttachmentItem, mergeAgentAttachments } from './agentAttachmentTrayModel';

export const DRAFT_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;

export interface ResolvedAgentAttachmentEntry {
  path: string;
  sizeBytes?: number | null;
}

interface AgentAttachmentPathResolverOptions {
  draftMaxBytes?: number;
  preferTray?: boolean;
  resolveFilePath: (file: File) => string | null | undefined;
  saveFileToTemp: (file: File) => Promise<string | null>;
}

interface AgentAttachmentTargets {
  draftAttachments: AgentAttachmentItem[];
  trayAttachments: AgentAttachmentItem[];
}

function createEmptyAgentAttachmentTargets(): AgentAttachmentTargets {
  return {
    draftAttachments: [],
    trayAttachments: [],
  };
}

export function shouldRouteAgentAttachmentToTray(
  sizeBytes: number | null | undefined,
  draftMaxBytes = DRAFT_ATTACHMENT_MAX_BYTES
): boolean {
  return typeof sizeBytes === 'number' && sizeBytes > draftMaxBytes;
}

export function partitionResolvedAgentAttachments(
  entries: ResolvedAgentAttachmentEntry[],
  options?: {
    draftMaxBytes?: number;
    preferTray?: boolean;
  }
): AgentAttachmentTargets {
  if (entries.length === 0) {
    return createEmptyAgentAttachmentTargets();
  }

  const draftPaths: string[] = [];
  const trayPaths: string[] = [];
  const draftMaxBytes = options?.draftMaxBytes ?? DRAFT_ATTACHMENT_MAX_BYTES;
  const preferTray = options?.preferTray ?? false;

  for (const entry of entries) {
    if (!entry.path) {
      continue;
    }

    if (preferTray || shouldRouteAgentAttachmentToTray(entry.sizeBytes, draftMaxBytes)) {
      trayPaths.push(entry.path);
      continue;
    }

    draftPaths.push(entry.path);
  }

  return {
    draftAttachments: mergeAgentAttachments([], draftPaths),
    trayAttachments: mergeAgentAttachments([], trayPaths),
  };
}

export async function resolveAgentAttachmentTargetsFromFiles(
  files: File[],
  options: AgentAttachmentPathResolverOptions
): Promise<AgentAttachmentTargets> {
  if (files.length === 0) {
    return createEmptyAgentAttachmentTargets();
  }

  const resolvedEntries: ResolvedAgentAttachmentEntry[] = [];

  for (const file of files) {
    const nativePath = options.resolveFilePath(file);
    if (nativePath) {
      resolvedEntries.push({
        path: nativePath,
        sizeBytes: file.size,
      });
      continue;
    }

    const tempPath = await options.saveFileToTemp(file);
    if (tempPath) {
      resolvedEntries.push({
        path: tempPath,
        sizeBytes: file.size,
      });
    }
  }

  return partitionResolvedAgentAttachments(resolvedEntries, {
    draftMaxBytes: options.draftMaxBytes,
    preferTray: options.preferTray,
  });
}
