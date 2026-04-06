import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workflowSource = readFileSync(
  new URL('../../.github/workflows/build.yml', import.meta.url),
  'utf8'
);
const expressionOpen = '$' + '{{';
const expressionClose = '}}';
const shellExpressionOpen = '$' + '{';
const shellExpressionClose = '}';
const appleApiIssuer = `APPLE_API_ISSUER: ${expressionOpen} secrets.APPLE_API_ISSUER ${expressionClose}`;
const appleApiKey = `APPLE_API_KEY: ${expressionOpen} secrets.APPLE_API_KEY ${expressionClose}`;
const appleApiKeyP8 = `APPLE_API_KEY_P8: ${expressionOpen} secrets.APPLE_API_KEY_P8 ${expressionClose}`;
const allowUnsignedMacosRelease = `REPO_ALLOW_UNSIGNED_MACOS_RELEASE: ${expressionOpen} vars.ALLOW_UNSIGNED_MACOS_RELEASE ${expressionClose}`;
const macArchPlaceholder = '$' + '{{ matrix.arch }}';
const forceUnsignedCondition = `if [[ "${shellExpressionOpen}force_unsigned${shellExpressionClose}" == "true" ]]; then`;
const resolvedSigningIdentity = `CSC_NAME: ${expressionOpen} env.APPLE_SIGNING_IDENTITY_RESOLVED ${expressionClose}`;
const legacySigningIdentity = `CSC_NAME: ${expressionOpen} secrets.APPLE_SIGNING_IDENTITY ${expressionClose}`;

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

  it('allows explicitly forcing unsigned macOS release builds even when signing secrets exist', () => {
    expect(workflowSource).toContain('force_unsigned="true"');
    expect(workflowSource).toContain(forceUnsignedCondition);
    expect(workflowSource).toContain(
      'macOS signing is being skipped because unsigned output was explicitly requested.'
    );
  });

  it('resolves the Developer ID Application identity from the imported certificate', () => {
    expect(workflowSource).toContain('Developer ID Application:');
    expect(workflowSource).toContain('APPLE_SIGNING_IDENTITY_RESOLVED');
    expect(workflowSource).toContain(resolvedSigningIdentity);
    expect(workflowSource).not.toContain(legacySigningIdentity);
  });

  it('keeps both macOS architectures running and surfaces discovered identities when signing fails', () => {
    expect(workflowSource).toContain('build-mac:');
    expect(workflowSource).toContain('fail-fast: false');
    expect(workflowSource).toContain('Found identities:');
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

  it('creates a draft release before uploading remote runtime assets', () => {
    expect(workflowSource).toContain('Upload remote runtime bundle to Release');
    expect(workflowSource).toContain(
      'gh release view "$TAG" >/dev/null 2>&1 || gh release create "$TAG" --draft --title "$TAG" --notes ""'
    );
    expect(workflowSource).toContain('gh release upload "$TAG" dist/remote-runtime/* --clobber');
  });
});
