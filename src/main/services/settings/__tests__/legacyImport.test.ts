import { describe, expect, it } from 'vitest';
import {
  buildLegacySettingsImportPayload,
  buildLegacySettingsImportPreview,
} from '../legacyImport';

describe('legacySettingsImport', () => {
  it('builds a nested diff preview for a valid EnsoAI settings document', () => {
    const preview = buildLegacySettingsImportPreview(
      {
        'enso-settings': {
          state: {
            theme: 'system',
            language: 'en',
            claudeCodeIntegration: {
              enableProviderWatcher: true,
            },
          },
        },
      },
      {
        'enso-settings': {
          state: {
            theme: 'dark',
            language: 'zh',
            claudeCodeIntegration: {
              enableProviderWatcher: false,
            },
          },
        },
      },
      '/Volumes/OldMac/.ensoai/settings.json'
    );

    expect(preview.importable).toBe(true);
    expect(preview.diffCount).toBe(3);
    expect(preview.truncated).toBe(false);
    expect(preview.diffs).toEqual([
      {
        path: 'claudeCodeIntegration.enableProviderWatcher',
        currentValue: 'true',
        importedValue: 'false',
      },
      {
        path: 'language',
        currentValue: '"en"',
        importedValue: '"zh"',
      },
      {
        path: 'theme',
        currentValue: '"system"',
        importedValue: '"dark"',
      },
    ]);
  });

  it('returns a non-importable preview when the file does not contain persisted EnsoAI settings', () => {
    const preview = buildLegacySettingsImportPreview(
      {
        'enso-settings': {
          state: {
            theme: 'system',
          },
        },
      },
      {
        invalid: true,
      },
      'D:\\Users\\old\\.ensoai\\settings.json'
    );

    expect(preview.importable).toBe(false);
    expect(preview.diffCount).toBe(0);
    expect(preview.error).toBe('Selected file does not contain persisted EnsoAI settings.');
  });

  it('builds an apply payload that only replaces the persisted settings slice', () => {
    const payload = buildLegacySettingsImportPayload(
      {
        other: {
          keep: true,
        },
        'enso-settings': {
          state: {
            theme: 'system',
          },
        },
      },
      {
        'enso-settings': {
          state: {
            theme: 'dark',
            language: 'zh',
          },
        },
        ignoredRootKey: true,
      }
    );

    expect(payload).toEqual({
      other: {
        keep: true,
      },
      'enso-settings': {
        state: {
          theme: 'dark',
          language: 'zh',
        },
      },
    });
  });
});
