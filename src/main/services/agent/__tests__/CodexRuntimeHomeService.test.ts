import { mkdtempSync, readlinkSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { CodexRuntimeHomeService } from '../CodexRuntimeHomeService';

const tempRoots: string[] = [];

function createTempRoot(): string {
  const root = mkdtempSync(path.join(os.tmpdir(), 'infilux-codex-runtime-home-'));
  tempRoots.push(root);
  return root;
}

describe('CodexRuntimeHomeService', () => {
  afterEach(() => {
    for (const root of tempRoots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('creates an isolated runtime home and links shared Codex configuration entries', () => {
    const sourceHome = createTempRoot();
    const runtimeRoot = createTempRoot();
    writeFileSync(path.join(sourceHome, 'auth.json'), '{}');
    writeFileSync(path.join(sourceHome, 'config.toml'), 'model = "gpt-5.5"');
    const service = new CodexRuntimeHomeService(sourceHome, runtimeRoot);

    const result = service.prepareRuntimeHome('session/with spaces');

    expect(result).toEqual({
      homePath: path.join(runtimeRoot, 'session-with-spaces'),
      sourceHomePath: sourceHome,
    });
    expect(readlinkSync(path.join(result.homePath, 'auth.json'))).toBe(
      path.join(sourceHome, 'auth.json')
    );
    expect(readlinkSync(path.join(result.homePath, 'config.toml'))).toBe(
      path.join(sourceHome, 'config.toml')
    );
  });
});
