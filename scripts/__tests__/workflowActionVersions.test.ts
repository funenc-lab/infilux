import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const workflowsDirectory = '.github/workflows';
const packageManagerPlaceholder = '$' + '{PACKAGE_MANAGER}';
const githubRunIdPlaceholder = '$' + '{GITHUB_RUN_ID}';
const trackedActions = {
  'actions/cache': 'v5',
  'actions/checkout': 'v6',
  'actions/setup-node': 'v6',
  'actions/upload-artifact': 'v7',
} as const;
const forbiddenActions = ['actions/download-artifact', 'pnpm/action-setup'] as const;

const actionVersionPattern =
  /uses:\s+(actions\/cache|actions\/checkout|actions\/setup-node|actions\/upload-artifact)@([^\s]+)/g;

type TrackedActionName = keyof typeof trackedActions;

function readWorkflowSources() {
  return readdirSync(workflowsDirectory)
    .filter((fileName) => fileName.endsWith('.yml'))
    .map((fileName) => ({
      fileName,
      source: readFileSync(join(workflowsDirectory, fileName), 'utf8'),
    }));
}

function collectReferencedVersions(source: string) {
  const versions = new Map<TrackedActionName, Set<string>>();

  for (const match of source.matchAll(actionVersionPattern)) {
    const actionName = match[1] as TrackedActionName;
    const version = match[2];
    const actionVersions = versions.get(actionName) ?? new Set<string>();

    actionVersions.add(version);
    versions.set(actionName, actionVersions);
  }

  return versions;
}

describe('workflow action runtime policy', () => {
  it('pins tracked GitHub Actions to the approved Node 24 compatible major versions', () => {
    const workflowSources = readWorkflowSources();

    expect(workflowSources.length).toBeGreaterThan(0);

    for (const workflow of workflowSources) {
      const referencedVersions = collectReferencedVersions(workflow.source);

      for (const [actionName, expectedVersion] of Object.entries(trackedActions) as Array<
        [TrackedActionName, string]
      >) {
        const actualVersions = referencedVersions.get(actionName);

        if (!actualVersions) {
          continue;
        }

        expect(
          [...actualVersions],
          `${workflow.fileName} should pin ${actionName} to ${expectedVersion}`
        ).toEqual([expectedVersion]);
      }
    }
  });

  it('avoids helper actions that still emit deprecation warnings in the build workflow', () => {
    const buildWorkflowSource = readFileSync(join(workflowsDirectory, 'build.yml'), 'utf8');

    for (const actionName of forbiddenActions) {
      expect(buildWorkflowSource).not.toContain(`uses: ${actionName}@`);
    }

    expect(buildWorkflowSource).toContain(`corepack install -g "${packageManagerPlaceholder}"`);
    expect(buildWorkflowSource).toContain(`gh run download "${githubRunIdPlaceholder}"`);
    expect(buildWorkflowSource).toContain("-p 'latest-mac-*'");
  });
});
