import { describe, expect, it, vi } from 'vitest';
import {
  partitionResolvedAgentAttachments,
  resolveAgentAttachmentTargetsFromFiles,
  shouldRouteAgentAttachmentToTray,
} from '../agentAttachmentInput';

describe('agentAttachmentInput', () => {
  it('routes small attachments to the draft input and large ones to the tray', async () => {
    const specFile = { name: 'spec.md', type: 'text/markdown' } as File;
    const clipboardImage = { name: 'clipboard.png', type: 'image/png' } as File;
    const releaseArchive = { name: 'release.zip', type: 'application/zip' } as File;

    Object.defineProperty(specFile, 'size', { value: 1024 });
    Object.defineProperty(clipboardImage, 'size', { value: 1024 * 1024 });
    Object.defineProperty(releaseArchive, 'size', { value: 12 * 1024 * 1024 });

    const nativePaths = new Map<File, string>([
      [specFile, 'docs/spec.md'],
      [releaseArchive, '/repo/release.zip'],
    ]);
    const saveFileToTemp = vi.fn(async (file: File) =>
      file === clipboardImage ? '/tmp/clipboard-image.png' : null
    );

    const targets = await resolveAgentAttachmentTargetsFromFiles(
      [specFile, clipboardImage, releaseArchive],
      {
        resolveFilePath: (file) => nativePaths.get(file) ?? null,
        saveFileToTemp,
      }
    );

    expect(targets.draftAttachments).toEqual([
      {
        id: 'docs/spec.md',
        kind: 'file',
        name: 'spec.md',
        path: 'docs/spec.md',
      },
      {
        id: '/tmp/clipboard-image.png',
        kind: 'image',
        name: 'clipboard-image.png',
        path: '/tmp/clipboard-image.png',
      },
    ]);
    expect(targets.trayAttachments).toEqual([
      {
        id: '/repo/release.zip',
        kind: 'file',
        name: 'release.zip',
        path: '/repo/release.zip',
      },
    ]);
    expect(saveFileToTemp).toHaveBeenCalledTimes(1);
    expect(saveFileToTemp).toHaveBeenCalledWith(clipboardImage);
  });

  it('forces manually selected tray uploads into the tray regardless of size', async () => {
    const specFile = { name: 'spec.md', type: 'text/markdown' } as File;
    Object.defineProperty(specFile, 'size', { value: 1024 });

    const targets = await resolveAgentAttachmentTargetsFromFiles([specFile], {
      preferTray: true,
      resolveFilePath: () => 'docs/spec.md',
      saveFileToTemp: vi.fn(async () => null),
    });

    expect(targets.draftAttachments).toEqual([]);
    expect(targets.trayAttachments).toEqual([
      {
        id: 'docs/spec.md',
        kind: 'file',
        name: 'spec.md',
        path: 'docs/spec.md',
      },
    ]);
  });

  it('falls back to temp storage for non-image files when the browser file has no native path', async () => {
    const notesFile = { name: 'notes.txt', type: 'text/plain' } as File;
    Object.defineProperty(notesFile, 'size', { value: 4096 });

    const saveFileToTemp = vi.fn(async (file: File) =>
      file === notesFile ? '/tmp/notes-from-browser.txt' : null
    );

    const targets = await resolveAgentAttachmentTargetsFromFiles([notesFile], {
      resolveFilePath: () => null,
      saveFileToTemp,
    });

    expect(targets.draftAttachments).toEqual([
      {
        id: '/tmp/notes-from-browser.txt',
        kind: 'file',
        name: 'notes-from-browser.txt',
        path: '/tmp/notes-from-browser.txt',
      },
    ]);
    expect(targets.trayAttachments).toEqual([]);
    expect(saveFileToTemp).toHaveBeenCalledTimes(1);
    expect(saveFileToTemp).toHaveBeenCalledWith(notesFile);
  });

  it('partitions already resolved drop entries using the size threshold', () => {
    const targets = partitionResolvedAgentAttachments([
      { path: 'docs/spec.md', sizeBytes: 512 },
      { path: '/repo/release.zip', sizeBytes: 12 * 1024 * 1024 },
      { path: '/repo/unknown.bin' },
    ]);

    expect(targets.draftAttachments.map((attachment) => attachment.path)).toEqual([
      'docs/spec.md',
      '/repo/unknown.bin',
    ]);
    expect(targets.trayAttachments.map((attachment) => attachment.path)).toEqual([
      '/repo/release.zip',
    ]);
  });

  it('treats only files larger than 10MB as tray uploads by default', () => {
    expect(shouldRouteAgentAttachmentToTray(10 * 1024 * 1024)).toBe(false);
    expect(shouldRouteAgentAttachmentToTray(10 * 1024 * 1024 + 1)).toBe(true);
    expect(shouldRouteAgentAttachmentToTray(undefined)).toBe(false);
  });
});
