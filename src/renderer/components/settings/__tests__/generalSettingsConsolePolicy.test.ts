import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const generalSettingsSource = readFileSync(resolve(currentDir, '../GeneralSettings.tsx'), 'utf8');

describe('general settings console policy', () => {
  it('keeps top-level option selectors flat while preserving themed console code surfaces', () => {
    expect(generalSettingsSource).toContain('function SettingsOptionCard({');
    expect(generalSettingsSource).toContain(
      "'group relative flex min-w-0 items-start gap-3 rounded-lg border border-transparent px-3 py-3 text-left transition-colors'"
    );
    expect(generalSettingsSource).toContain('<SettingsCodeSurface>');
    expect(generalSettingsSource).not.toContain(
      "'flex flex-col items-center gap-2 rounded-lg border p-4 transition-colors'"
    );
  });
});
