import { lstat } from 'node:fs/promises';
import path from 'node:path';

/**
 * Validate a local path for use as a repository.
 *
 * Security note: This is a local Electron desktop app where the user already has
 * full filesystem access. Path restriction (e.g., home directory only) is unnecessary
 * since users can access any path via terminal anyway. This differs from web services
 * where path probing attacks are a real concern.
 */
export async function validateLocalPath(inputPath: string): Promise<{
  exists: boolean;
  isDirectory: boolean;
  isGitRepository: boolean;
}> {
  try {
    const stats = await lstat(inputPath);
    const isDirectory = stats.isDirectory();
    if (!isDirectory) {
      return { exists: true, isDirectory: false, isGitRepository: false };
    }

    try {
      await lstat(path.join(inputPath, '.git'));
      return { exists: true, isDirectory: true, isGitRepository: true };
    } catch {
      return { exists: true, isDirectory: true, isGitRepository: false };
    }
  } catch {
    return { exists: false, isDirectory: false, isGitRepository: false };
  }
}
