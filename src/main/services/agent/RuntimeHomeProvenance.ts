import { existsSync, lstatSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const MANAGED_RUNTIME_HOME_MARKER_FILE_NAME = '.infilux-managed-runtime-home-v1';

const MANAGED_RUNTIME_HOME_MARKER_CONTENT = '1\n';

function getMarkerPath(runtimeHomePath: string): string {
  return path.join(runtimeHomePath, MANAGED_RUNTIME_HOME_MARKER_FILE_NAME);
}

export function markManagedRuntimeHome(runtimeHomePath: string): void {
  const markerPath = getMarkerPath(runtimeHomePath);
  if (existsSync(markerPath)) {
    const markerStat = lstatSync(markerPath);
    if (markerStat.isSymbolicLink() || !markerStat.isFile()) {
      throw new Error(`Invalid managed runtime home marker: ${markerPath}`);
    }
    if (readFileSync(markerPath, 'utf8') === MANAGED_RUNTIME_HOME_MARKER_CONTENT) {
      return;
    }
  }

  writeFileSync(markerPath, MANAGED_RUNTIME_HOME_MARKER_CONTENT, {
    encoding: 'utf8',
    mode: 0o600,
  });
}

export function isManagedRuntimeHome(runtimeHomePath: string): boolean {
  try {
    const markerPath = getMarkerPath(runtimeHomePath);
    const markerStat = lstatSync(markerPath);
    return (
      !markerStat.isSymbolicLink() &&
      markerStat.isFile() &&
      readFileSync(markerPath, 'utf8') === MANAGED_RUNTIME_HOME_MARKER_CONTENT
    );
  } catch {
    return false;
  }
}
