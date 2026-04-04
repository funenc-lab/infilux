import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const workflowsDirectory = '.github/workflows';
const trackedActions = {
  'actions/cache': 'v5',
  'actions/checkout': 'v6',
  'actions/download-artifact': 'v8',
  'actions/setup-node': 'v6',
  'actions/upload-artifact': 'v7',
  'pnpm/action-setup': 'v5',
} as const;

const actionVersionPattern =
  /uses:\s+(actions\/cache|actions\/checkout|actions\/download-artifact|actions\/setup-node|actions\/upload-artifact|pnpm\/action-setup)@([^\s]+)/g;

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
});
