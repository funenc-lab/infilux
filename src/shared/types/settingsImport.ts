export interface LegacySettingsImportDiffEntry {
  path: string;
  currentValue: string;
  importedValue: string;
}

export interface LegacySettingsImportPreview {
  sourcePath: string;
  importable: boolean;
  diffCount: number;
  diffs: LegacySettingsImportDiffEntry[];
  truncated: boolean;
  error?: string;
}

export interface LegacySettingsImportApplyResult {
  imported: boolean;
  sourcePath: string;
  diffCount: number;
  legacyLocalStorageSnapshot?: Record<string, string>;
  error?: string;
}
