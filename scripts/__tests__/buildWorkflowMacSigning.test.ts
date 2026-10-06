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
const macArchPlaceholder = '$' + '{{ matrix.arch }}';
const forceUnsignedCondition = `if [[ "${shellExpressionOpen}force_unsigned${shellExpressionClose}" == "true" ]]; then`;
const resolvedSigningIdentity = `CSC_NAME: ${expressionOpen} env.APPLE_SIGNING_IDENTITY_RESOLVED ${expressionClose}`;
const legacySigningIdentity = `CSC_NAME: ${expressionOpen} secrets.APPLE_SIGNING_IDENTITY ${expressionClose}`;
const signingIdentityFallback =
  'Falling back to the first imported Developer ID Application certificate name.';
const strictSigningIdentityMismatch =
  'APPLE_SIGNING_IDENTITY does not match an identity in the imported certificate';
const developerIdIdentityParser = `awk -F '"' '/Developer ID Application:/ { print $2; exit }'`;
const escapedSedCapture = `sed -n 's/.*"\\\\(Developer ID Application:.*\\\\)"/\\\\1/p'`;
const developerIdCertificateName =
  'developer_id_certificate_name="' +
  shellExpressionOpen +
  'developer_id_identity#Developer ID Application: ' +
  shellExpressionClose +
  '"';

describe('build workflow macOS signing policy', () => {
  it('uses the organization Apple signing secret names without a release-wide unsigned override', () => {
    expect(workflowSource).toContain('allow_unsigned_macos:');
    expect(workflowSource).toContain(appleId);
    expect(workflowSource).toContain(applePassword);
    expect(workflowSource).toContain(appleAppSpecificPassword);
    expect(workflowSource).toContain(appleTeamId);
    expect(workflowSource).not.toContain('REPO_ALLOW_UNSIGNED_MACOS_RELEASE');
    expect(workflowSource).not.toContain('secrets.APPLE_API_ISSUER');
    expect(workflowSource).not.toContain('secrets.APPLE_API_KEY');
    expect(workflowSource).not.toContain('secrets.APPLE_API_KEY_P8');
  });

  it('supports unsigned macOS fallback only for untagged builds', () => {
    expect(workflowSource).toContain(`Build macOS (${macArchPlaceholder}) unsigned`);
    expect(workflowSource).toContain("CSC_IDENTITY_AUTO_DISCOVERY: 'false'");
    expect(workflowSource).toContain('-c.mac.identity=null -c.mac.notarize=false --publish never');
    expect(workflowSource).toContain(
      `if: ${expressionOpen} !startsWith(github.ref, 'refs/tags/') && (steps.macos_signing.outputs.ready != 'true' || steps.import_apple_certificate.outcome != 'success') ${expressionClose}`
    );
  });

  it('allows manually forcing unsigned macOS builds only without a release tag', () => {
    expect(workflowSource).toContain('force_unsigned="true"');
    expect(workflowSource).toContain(forceUnsignedCondition);
    expect(workflowSource).toContain(
      `if [[ "${shellExpressionOpen}IS_TAG_BUILD}" == "true" && "${shellExpressionOpen}WORKFLOW_ALLOW_UNSIGNED_MACOS}" == "true" ]]; then`
    );
    expect(workflowSource).toContain(
      'macOS signing is being skipped because unsigned output was explicitly requested.'
    );
  });

  it('stops a tagged macOS build before packaging if signing is unavailable', () => {
    const releaseGateStep = workflowSource.indexOf('name: Require signed macOS release');
    const importStep = workflowSource.indexOf('name: Import Apple Certificate');
    const signedBuildStep = workflowSource.indexOf(`Build macOS (${macArchPlaceholder}) signed`);

    expect(releaseGateStep).toBeGreaterThan(importStep);
    expect(releaseGateStep).toBeLessThan(signedBuildStep);
    expect(workflowSource).toContain('name: Require signed macOS release');
    expect(workflowSource).toContain("if: startsWith(github.ref, 'refs/tags/')");
    expect(workflowSource).toContain(
      `CERTIFICATE_IMPORTED: ${expressionOpen} steps.import_apple_certificate.outcome ${expressionClose}`
    );
    expect(workflowSource).toContain(
      'if [[ "$SIGNING_READY" != "true" || "$CERTIFICATE_IMPORTED" != "success" ]]; then'
    );
    expect(workflowSource).toContain('Only untagged manual builds may be unsigned.');
    expect(workflowSource).not.toContain(
      'Configure the APPLE_* secrets or explicitly allow unsigned macOS output.'
    );
  });

  it('verifies the packaged macOS app retains the original Developer ID signer', () => {
    const verificationStep = workflowSource.indexOf('name: Verify signed macOS app');
    const signedBuildStep = workflowSource.indexOf(`Build macOS (${macArchPlaceholder}) signed`);
    const metadataUploadStep = workflowSource.indexOf('name: Upload latest-mac.yml');

    expect(verificationStep).toBeGreaterThan(signedBuildStep);
    expect(verificationStep).toBeLessThan(metadataUploadStep);
    expect(workflowSource.slice(verificationStep, metadataUploadStep)).toContain(
      "if: startsWith(github.ref, 'refs/tags/')"
    );
    expect(workflowSource).toContain('dist/mac-arm64/Infilux.app');
    expect(workflowSource).toContain('dist/mac/Infilux.app');
    expect(workflowSource).toContain('codesign --verify --deep --strict --verbose=2 "$app_path"');
    expect(workflowSource).toContain('Authority=Developer ID Application:');
    expect(workflowSource).toContain('TeamIdentifier=SG6MVT62JU');
  });

  it('builds without implicit publishing and uploads only after signing verification', () => {
    const signedBuildStep = workflowSource.indexOf(`Build macOS (${macArchPlaceholder}) signed`);
    const verificationStep = workflowSource.indexOf('name: Verify signed macOS app');
    const publishStep = workflowSource.indexOf('name: Publish verified macOS artifacts');
    const metadataUploadStep = workflowSource.indexOf('name: Upload latest-mac.yml');

    expect(workflowSource.slice(signedBuildStep, verificationStep)).toContain(
      `npx electron-builder --mac --${macArchPlaceholder} --publish never`
    );
    expect(publishStep).toBeGreaterThan(verificationStep);
    expect(publishStep).toBeLessThan(metadataUploadStep);
    expect(workflowSource.slice(publishStep, metadataUploadStep)).toContain(
      "if: startsWith(github.ref, 'refs/tags/v')"
    );
    expect(workflowSource.slice(publishStep, metadataUploadStep)).toContain(
      `gh release upload "$TAG" "${shellExpressionOpen}dmg_files[0]}" "${shellExpressionOpen}zip_files[0]}" --clobber`
    );
    expect(workflowSource.slice(publishStep, metadataUploadStep)).toContain(
      `[[ "${shellExpressionOpen}#dmg_files[@]}" -ne 1 || "${shellExpressionOpen}#zip_files[@]}" -ne 1 || ! -f dist/latest-mac.yml ]]`
    );
    expect(workflowSource.slice(publishStep, metadataUploadStep)).toContain(
      'gh release view "$TAG" --json isDraft --jq .isDraft'
    );
    expect(workflowSource.slice(publishStep, metadataUploadStep)).toContain(
      'gh release create "$TAG" --draft --verify-tag'
    );
  });

  it('resolves the Developer ID Application identity from the imported certificate', () => {
    expect(workflowSource).toContain('Developer ID Application:');
    expect(workflowSource).toContain('developer_id_identity=');
    expect(workflowSource).toContain(developerIdCertificateName);
    expect(workflowSource).toContain(developerIdIdentityParser);
    expect(workflowSource).not.toContain(escapedSedCapture);
    expect(workflowSource).toContain('Configured Apple signing identity was not found');
    expect(workflowSource).toContain(signingIdentityFallback);
    expect(workflowSource).not.toContain(strictSigningIdentityMismatch);
    expect(workflowSource).toContain('Resolved Apple signing certificate name:');
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
