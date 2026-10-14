import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const policyScript = fileURLToPath(new URL('../release/macos-signing-policy.mjs', import.meta.url));
const signingSecrets = {
  APPLE_CERTIFICATE: 'test-certificate-not-a-real-secret',
  APPLE_CERTIFICATE_PASSWORD: 'test-certificate-password',
  APPLE_ID: 'test-apple-id',
  APPLE_PASSWORD: 'test-apple-password',
  APPLE_TEAM_ID: 'test-team-id',
};
const tempDirectories: string[] = [];

function runPolicy(overrides: Record<string, string | undefined> = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'infilux-macos-signing-policy-'));
  tempDirectories.push(directory);
  const outputPath = join(directory, 'github-output');
  const result = spawnSync(process.execPath, [policyScript], {
    env: { PATH: process.env.PATH, GITHUB_OUTPUT: outputPath, ...overrides },
    encoding: 'utf8',
    timeout: 5000,
  });
  return {
    ...result,
    output: existsSync(outputPath) ? readFileSync(outputPath, 'utf8') : '',
  };
}

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('macOS signing policy CLI', () => {
  it('defaults to unsigned without Apple credentials', () => {
    const result = runPolicy();

    expect(result.status).toBe(0);
    expect(result.output).toBe(
      'ready=false\nmissing=\nunsigned_allowed=true\nunsigned_reason=default\n'
    );
  });

  it('does not enable signing implicitly when credentials exist', () => {
    const result = runPolicy(signingSecrets);

    expect(result.status).toBe(0);
    expect(result.output).toContain('ready=false\n');
    expect(result.output).toContain('unsigned_reason=default\n');
  });

  it('retains the explicit unsigned override', () => {
    const result = runPolicy({ ...signingSecrets, WORKFLOW_ALLOW_UNSIGNED_MACOS: 'true' });

    expect(result.status).toBe(0);
    expect(result.output).toContain('unsigned_allowed=true\n');
    expect(result.output).toContain('unsigned_reason=override\n');
  });

  it('enables explicit signing only with all required credentials', () => {
    const result = runPolicy({ ...signingSecrets, WORKFLOW_SIGN_MACOS: 'true' });

    expect(result.status).toBe(0);
    expect(result.output).toBe('ready=true\nmissing=\nunsigned_allowed=false\nunsigned_reason=\n');
  });

  it.each(Object.keys(signingSecrets))('fails explicit signing when %s is missing', (secret) => {
    const result = runPolicy({
      ...signingSecrets,
      WORKFLOW_SIGN_MACOS: 'true',
      [secret]: undefined,
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`Missing Apple signing secrets: ${secret}`);
    expect(result.output).toBe('');
    for (const value of Object.values(signingSecrets)) {
      expect(result.stdout + result.stderr).not.toContain(value);
    }
  });

  it('treats whitespace-only credentials as missing', () => {
    const result = runPolicy({
      ...signingSecrets,
      WORKFLOW_SIGN_MACOS: 'true',
      APPLE_ID: '  ',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Missing Apple signing secrets: APPLE_ID');
    expect(result.output).toBe('');
  });

  it('rejects conflicting signed and unsigned requests', () => {
    const result = runPolicy({
      ...signingSecrets,
      WORKFLOW_SIGN_MACOS: 'true',
      WORKFLOW_ALLOW_UNSIGNED_MACOS: 'true',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Cannot request both signed and unsigned macOS output');
    expect(result.output).toBe('');
  });

  it.each([
    'WORKFLOW_SIGN_MACOS',
    'WORKFLOW_ALLOW_UNSIGNED_MACOS',
  ])('rejects invalid boolean input for %s', (flag) => {
    const result = runPolicy({ [flag]: 'invalid' });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`${flag} must be true or false`);
    expect(result.output).toBe('');
  });

  it('requires a GitHub output path', () => {
    const result = runPolicy({ GITHUB_OUTPUT: undefined });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('GITHUB_OUTPUT is required');
    expect(result.output).toBe('');
  });
});
