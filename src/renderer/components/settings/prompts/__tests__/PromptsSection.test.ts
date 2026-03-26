import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const sectionSource = readFileSync(resolve(currentDir, '../PromptsSection.tsx'), 'utf8');

describe('PromptsSection source', () => {
  it('does not render an action button inside the collapsible header button', () => {
    expect(sectionSource).not.toMatch(
      /<button[\s\S]*?<Button\s+variant="ghost"\s+size="icon-xs"[\s\S]*?<\/button>/m
    );
  });
});
