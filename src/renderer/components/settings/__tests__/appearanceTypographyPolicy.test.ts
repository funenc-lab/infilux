import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const appearanceSettingsSource = readFileSync(
  resolve(currentDir, '../AppearanceSettings.tsx'),
  'utf8'
);

describe('appearance typography policy', () => {
  it('keeps appearance card titles aligned with the shared settings typography scale', () => {
    expect(appearanceSettingsSource).not.toContain(
      'className="text-sm font-semibold tracking-[-0.01em]"'
    );
    expect(appearanceSettingsSource).not.toContain(
      'className="truncate text-sm font-semibold tracking-[-0.01em]"'
    );
    expect(appearanceSettingsSource).not.toContain(
      'className="text-base font-semibold tracking-[-0.015em]"'
    );
  });
});
