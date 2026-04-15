import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const dialogSource = readFileSync(resolve(currentDir, '../ClaudeSessionLaunchDialog.tsx'), 'utf8');

describe('ClaudeSessionLaunchDialog layout', () => {
  it('uses a fixed popup height and keeps content scrolling inside the dialog body', () => {
    expect(dialogSource).toContain('h-[min(78vh,44rem)]');
    expect(dialogSource).toContain("from '@/components/ui/scroll-area'");
    expect(dialogSource).toContain('className="min-h-0 flex-1 px-6"');
  });
});
