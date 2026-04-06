import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const workflowsDirectory = '.github/workflows';
const workflowFiles = readdirSync(workflowsDirectory)
  .filter((fileName) => fileName.endsWith('.yml'))
  .sort();
const workflowSources = workflowFiles.map((fileName) => ({
  fileName,
  source: readFileSync(join(workflowsDirectory, fileName), 'utf8'),
}));
const buildWorkflowSource = readFileSync(join(workflowsDirectory, 'build.yml'), 'utf8');

describe('github action runtime compatibility policy', () => {
  it('uses Node 24 compatible checkout actions across every workflow', () => {
    for (const workflow of workflowSources) {
      expect(workflow.source).not.toContain('uses: actions/checkout@v4');
    }
  });

  it('uses Node 24 compatible setup-node and cache actions in the build workflow', () => {
    expect(buildWorkflowSource).toContain('uses: actions/setup-node@v6');
    expect(buildWorkflowSource).toContain('uses: actions/cache@v5');
    expect(buildWorkflowSource).not.toContain('uses: actions/setup-node@v4');
    expect(buildWorkflowSource).not.toContain('uses: actions/cache@v4');
  });

  it('uses corepack-managed pnpm instead of the deprecated pnpm action', () => {
    expect(buildWorkflowSource).toContain('corepack enable');
    expect(buildWorkflowSource).toContain('corepack prepare pnpm@10.26.2 --activate');
    expect(buildWorkflowSource).not.toContain('uses: pnpm/action-setup@v4');
  });
});
