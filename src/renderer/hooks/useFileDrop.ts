import { fileUriToPath } from '@shared/utils/fileUrl';
import { normalizePath } from '@shared/utils/path';
import { useEffect, useRef } from 'react';
import { getRendererPlatform } from '@/lib/electronEnvironment';

interface UseFileDropOptions {
  /** Project working directory, used to convert absolute paths to relative */
  cwd?: string;
  /** Callback when file paths are resolved from a drop event */
  onDrop: (files: DroppedFileDescriptor[]) => void;
  /** Whether the hook is enabled (default: true) */
  enabled?: boolean;
}

export interface DroppedFileDescriptor {
  path: string;
  sizeBytes?: number;
}

/**
 * Hook to handle external file drops (from OS file manager, VS Code, etc.)
 * onto a target element. Uses capture-phase listeners to intercept before
 * child elements (e.g., xterm.js) can swallow the events.
 *
 * Supports:
 * - Native file drops (Finder, Explorer) via `dataTransfer.files` + Electron `webUtils`
 * - VS Code / IDE drops via `text/uri-list` (file:// URIs)
 */
export function useFileDrop<T extends HTMLElement>({
  cwd,
  onDrop,
  enabled = true,
}: UseFileDropOptions) {
  const ref = useRef<T>(null);
  const onDropRef = useRef(onDrop);
  onDropRef.current = onDrop;

  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;

    const hasDroppableData = (dt: DataTransfer | null): boolean => {
      if (!dt) return false;
      return dt.types.includes('Files') || dt.types.includes('text/uri-list');
    };

    const handleDragOver = (e: DragEvent) => {
      if (hasDroppableData(e.dataTransfer)) {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer!.dropEffect = 'copy';
      }
    };

    const handleDrop = (e: DragEvent) => {
      if (!hasDroppableData(e.dataTransfer)) return;

      e.preventDefault();
      e.stopPropagation();

      const resolved = resolveDroppedFiles(e.dataTransfer!, cwd);
      if (resolved.length > 0) {
        onDropRef.current(resolved);
      }
    };

    el.addEventListener('dragover', handleDragOver, true);
    el.addEventListener('drop', handleDrop, true);
    return () => {
      el.removeEventListener('dragover', handleDragOver, true);
      el.removeEventListener('drop', handleDrop, true);
    };
  }, [cwd, enabled]);

  return ref;
}

/**
 * Extract file paths from a DataTransfer, supporting:
 * 1. Native file drops (dataTransfer.files + Electron webUtils)
 * 2. URI list drops (text/uri-list from VS Code, etc.)
 */
function resolveDroppedFiles(dt: DataTransfer, cwd?: string): DroppedFileDescriptor[] {
  const files: DroppedFileDescriptor[] = [];

  // 1. Try native files first (Finder / Explorer)
  if (dt.files.length > 0) {
    for (let i = 0; i < dt.files.length; i++) {
      try {
        const filePath = window.electronAPI.utils.getPathForFile(dt.files[i]);
        if (filePath) {
          files.push({
            path: filePath,
            sizeBytes: dt.files[i]?.size,
          });
        }
      } catch {
        // getPathForFile may fail for non-native files
      }
    }
  }

  // 2. Fallback: parse text/uri-list (VS Code, other IDEs)
  if (files.length === 0) {
    const uriList = dt.getData('text/uri-list');
    if (uriList) {
      for (const line of uriList.split(/\r?\n/)) {
        const trimmed = line.trim();
        // Skip comments and empty lines per RFC 2483
        if (!trimmed || trimmed.startsWith('#')) continue;
        if (trimmed.startsWith('file://')) {
          const decoded = fileUriToPath(trimmed, getRendererPlatform());
          if (decoded) {
            files.push({ path: decoded });
          }
        }
      }
    }
  }

  // Convert to relative path if inside cwd, otherwise keep absolute path
  // Normalize separators for cross-platform compatibility
  const normalizedCwd = cwd ? normalizePath(cwd) : '';
  return files.map((file) => {
    const normalizedPath = normalizePath(file.path);
    if (normalizedCwd && normalizedPath.startsWith(`${normalizedCwd}/`)) {
      // File is inside current repo, use relative path
      return {
        path: normalizedPath.substring(normalizedCwd.length + 1),
        sizeBytes: file.sizeBytes,
      };
    }

    // File is outside current repo, use absolute path
    return {
      path: normalizedPath,
      sizeBytes: file.sizeBytes,
    };
  });
}
