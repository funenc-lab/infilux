import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const drawerSource = readFileSync(resolve(currentDir, '../AppResourceManagerDrawer.tsx'), 'utf8');
const tokenUsageDrawerSource = readFileSync(resolve(currentDir, '../TokenUsageDrawer.tsx'), 'utf8');

describe('app resource manager drawer token usage policy', () => {
  it('keeps project token usage out of the app resource manager drawer', () => {
    expect(drawerSource).not.toContain('ProjectTokenUsageSummary');
    expect(drawerSource).not.toContain('window.electronAPI.tokenUsage');
    expect(drawerSource).not.toContain('buildProjectTokenUsageRequest');
  });

  it('loads project token usage from the dedicated token usage drawer', () => {
    expect(tokenUsageDrawerSource).toContain('ProjectTokenUsageSummary');
    expect(tokenUsageDrawerSource).toContain('window.electronAPI.tokenUsage.getProjectUsage');
    expect(tokenUsageDrawerSource).toContain('buildProjectTokenUsageRequest(resourceSnapshot)');
  });
});
