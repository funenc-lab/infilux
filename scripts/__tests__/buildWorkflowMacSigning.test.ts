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
const appleId = `APPLE_ID: ${expressionOpen} secrets.APPLE_ID ${expressionClose}`;
const applePassword = `APPLE_PASSWORD: ${expressionOpen} secrets.APPLE_PASSWORD ${expressionClose}`;
const appleAppSpecificPassword = `APPLE_APP_SPECIFIC_PASSWORD: ${expressionOpen} secrets.APPLE_PASSWORD ${expressionClose}`;
const appleTeamId = `APPLE_TEAM_ID: ${expressionOpen} secrets.APPLE_TEAM_ID ${expressionClose}`;
const allowUnsignedMacosRelease = `REPO_ALLOW_UNSIGNED_MACOS_RELEASE: ${expressionOpen} vars.ALLOW_UNSIGNED_MACOS_RELEASE ${expressionClose}`;
const macArchPlaceholder = '$' + '{{ matrix.arch }}';
const forceUnsignedCondition = `if [[ "${shellExpressionOpen}force_unsigned${shellExpressionClose}" == "true" ]]; then`;
const resolvedSigningIdentity = `CSC_NAME: ${expressionOpen} env.APPLE_SIGNING_IDENTITY_RESOLVED ${expressionClose}`;
const legacySigningIdentity = `CSC_NAME: ${expressionOpen} secrets.APPLE_SIGNING_IDENTITY ${expressionClose}`;
const signingIdentityFallback =
  'Falling back to the first Developer ID Application identity from the imported certificate.';
const strictSigningIdentityMismatch =
  'APPLE_SIGNING_IDENTITY does not match an identity in the imported certificate';

describe('build workflow macOS signing policy', () => {
  it('uses the organization Apple signing secret names and unsigned release override', () => {
    expect(workflowSource).toContain('allow_unsigned_macos:');
    expect(workflowSource).toContain(appleId);
    expect(workflowSource).toContain(applePassword);
    expect(workflowSource).toContain(appleAppSpecificPassword);
    expect(workflowSource).toContain(appleTeamId);
    expect(workflowSource).toContain(allowUnsignedMacosRelease);
    expect(workflowSource).not.toContain('secrets.APPLE_API_ISSUER');
    expect(workflowSource).not.toContain('secrets.APPLE_API_KEY');
    expect(workflowSource).not.toContain('secrets.APPLE_API_KEY_P8');
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
    expect(workflowSource).toContain('developer_id_identity=');
    expect(workflowSource).toContain('Configured Apple signing identity was not found');
    expect(workflowSource).toContain(signingIdentityFallback);
    expect(workflowSource).not.toContain(strictSigningIdentityMismatch);
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

  it('verifies remote runtime release assets by tag version and runtime namespace', () => {
    expect(workflowSource).toContain(
      `const releaseVersion = '${expressionOpen} steps.tag.outputs.version ${expressionClose}';`
    );
    expect(workflowSource).toContain('const runtimeNamespace = readConstant(');
    expect(workflowSource).toContain("'src/shared/utils/runtimeIdentity.ts',");
    expect(workflowSource).toContain("/APP_RUNTIME_NAMESPACE = '([^']+)'/");
    expect(workflowSource).not.toContain("REMOTE_SERVER_VERSION = '([^']+)'");
  });
});
