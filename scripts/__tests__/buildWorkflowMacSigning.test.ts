import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workflowSource = readFileSync('.github/workflows/build.yml', 'utf8');
const expressionOpen = '$' + '{{';
const expressionClose = '}}';
const appleApiIssuer = `APPLE_API_ISSUER: ${expressionOpen} secrets.APPLE_API_ISSUER ${expressionClose}`;
const appleApiKey = `APPLE_API_KEY: ${expressionOpen} secrets.APPLE_API_KEY ${expressionClose}`;
const appleApiKeyP8 = `APPLE_API_KEY_P8: ${expressionOpen} secrets.APPLE_API_KEY_P8 ${expressionClose}`;
const allowUnsignedMacosRelease = `REPO_ALLOW_UNSIGNED_MACOS_RELEASE: ${expressionOpen} vars.ALLOW_UNSIGNED_MACOS_RELEASE ${expressionClose}`;
const macArchPlaceholder = '$' + '{{ matrix.arch }}';

describe('build workflow macOS signing policy', () => {
  it('reuses the penpad-style Apple signing secret names and unsigned release override', () => {
    expect(workflowSource).toContain('allow_unsigned_macos:');
    expect(workflowSource).toContain(appleApiIssuer);
    expect(workflowSource).toContain(appleApiKey);
    expect(workflowSource).toContain(appleApiKeyP8);
    expect(workflowSource).toContain(allowUnsignedMacosRelease);
  });

  it('supports unsigned macOS fallback when signing prerequisites are missing', () => {
    expect(workflowSource).toContain(`Build macOS (${macArchPlaceholder}) unsigned`);
    expect(workflowSource).toContain("CSC_IDENTITY_AUTO_DISCOVERY: 'false'");
    expect(workflowSource).toContain('-c.mac.identity=null -c.mac.notarize=false');
  });

  it('prevents prerelease tags from being marked as the latest release', () => {
    expect(workflowSource).toContain('if [[ "$TAG" == *-* ]]; then');
    expect(workflowSource).toContain(
      'gh release edit "$TAG" --draft=false --prerelease --notes-file release-notes.md'
    );
    expect(workflowSource).toContain(
      'gh release edit "$TAG" --draft=false --notes-file release-notes.md --latest'
    );
  });
});
