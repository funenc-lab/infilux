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
  it('serializes workflow runs sharing a release tag without cancelling an active upload', () => {
    const workflowHeader = workflowSource.slice(0, workflowSource.indexOf('\njobs:'));

    expect(workflowHeader).toContain(
      `concurrency:\n  group: ${expressionOpen} github.workflow ${expressionClose}-${expressionOpen} github.ref ${expressionClose}\n  cancel-in-progress: false`
    );
  });

  it('uses organization Apple signing secrets only through an explicit signing request', () => {
    expect(workflowSource).toContain(
      "sign_macos:\n        description: 'Sign and notarize macOS bundles for this manual build'\n        required: false\n        default: false\n        type: boolean"
    );
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

  it('supports macOS releases without Developer ID signing, notarization, or hardened runtime', () => {
    expect(workflowSource).toContain(`Build macOS (${macArchPlaceholder}) unsigned`);
    expect(workflowSource).toContain("CSC_IDENTITY_AUTO_DISCOVERY: 'false'");
    expect(workflowSource).toContain(
      `-c.mac.identity="${expressionOpen} matrix.arch == 'arm64' && '-' || 'null' ${expressionClose}" -c.mac.notarize=false -c.mac.hardenedRuntime=false -c.dmg.sign=false --publish never`
    );
    expect(workflowSource).toContain(
      `if: ${expressionOpen} steps.macos_signing.outputs.unsigned_allowed == 'true' ${expressionClose}`
    );
    expect(workflowSource).not.toContain('Only untagged manual builds may be unsigned.');
  });

  it('preserves certificate-free ARM64 signatures and checks the packaged executable can run', () => {
    const verificationStep = workflowSource.indexOf('name: Verify unsigned macOS app');
    const publishStep = workflowSource.indexOf('name: Publish verified macOS artifacts');
    const verificationSource = workflowSource.slice(verificationStep, publishStep);

    expect(verificationSource).toContain(
      'codesign --verify --deep --strict --verbose=2 "$app_path"'
    );
    expect(verificationSource).toContain('Signature=adhoc');
    expect(verificationSource).toContain(
      'ELECTRON_RUN_AS_NODE=1 "$app_path/Contents/MacOS/Infilux"'
    );
    expect(verificationSource).toContain('process.arch !== process.env.BUILD_ARCH');
    expect(verificationSource).not.toContain('APPLE_');
  });

  it('uses a tested policy CLI and propagates manual signing inputs', () => {
    expect(workflowSource).toContain('run: node scripts/release/macos-signing-policy.mjs');
    expect(workflowSource).toContain(
      `WORKFLOW_SIGN_MACOS: ${expressionOpen} github.event_name == 'workflow_dispatch' && inputs.sign_macos || 'false' ${expressionClose}`
    );
    expect(workflowSource).toContain(
      `WORKFLOW_ALLOW_UNSIGNED_MACOS: ${expressionOpen} github.event_name == 'workflow_dispatch' && inputs.allow_unsigned_macos || 'false' ${expressionClose}`
    );
    expect(workflowSource).toContain('name: Release workflow tests');
    expect(workflowSource).toContain('scripts/__tests__/macosSigningPolicy.test.ts');
  });

  it('fails explicit signing before packaging when certificate import is unavailable', () => {
    const releaseGateStep = workflowSource.indexOf('name: Require signed macOS release');
    const importStep = workflowSource.indexOf('name: Import Apple Certificate');
    const signedBuildStep = workflowSource.indexOf(`Build macOS (${macArchPlaceholder}) signed`);

    expect(releaseGateStep).toBeGreaterThan(importStep);
    expect(releaseGateStep).toBeLessThan(signedBuildStep);
    expect(workflowSource).toContain('name: Require signed macOS release');
    expect(workflowSource.slice(releaseGateStep, signedBuildStep)).toContain(
      `if: ${expressionOpen} steps.macos_signing.outputs.ready == 'true' ${expressionClose}`
    );
    expect(workflowSource).toContain(
      `CERTIFICATE_IMPORTED: ${expressionOpen} steps.import_apple_certificate.outcome ${expressionClose}`
    );
    expect(workflowSource).toContain(
      'if [[ "$SIGNING_READY" != "true" || "$CERTIFICATE_IMPORTED" != "success" ]]; then'
    );
    expect(workflowSource).not.toContain('name: Announce unsigned macOS fallback');
  });

  it('verifies the packaged macOS app retains the original Developer ID signer', () => {
    const verificationStep = workflowSource.indexOf('name: Verify signed macOS app');
    const signedBuildStep = workflowSource.indexOf(`Build macOS (${macArchPlaceholder}) signed`);
    const metadataUploadStep = workflowSource.indexOf('name: Upload latest-mac.yml');

    expect(verificationStep).toBeGreaterThan(signedBuildStep);
    expect(verificationStep).toBeLessThan(metadataUploadStep);
    expect(workflowSource.slice(verificationStep, metadataUploadStep)).toContain(
      `if: ${expressionOpen} steps.macos_signing.outputs.ready == 'true' && steps.import_apple_certificate.outcome == 'success' ${expressionClose}`
    );
    expect(workflowSource).toContain('dist/mac-arm64/Infilux.app');
    expect(workflowSource).toContain('dist/mac/Infilux.app');
    expect(workflowSource).toContain('codesign --verify --deep --strict --verbose=2 "$app_path"');
    expect(workflowSource).toContain('Authority=Developer ID Application:');
    expect(workflowSource).toContain('TeamIdentifier=SG6MVT62JU');
  });

  it('verifies unsigned bundle contents, version, and architecture before upload', () => {
    const buildStep = workflowSource.indexOf(`Build macOS (${macArchPlaceholder}) unsigned`);
    const verificationStep = workflowSource.indexOf('name: Verify unsigned macOS app');
    const publishStep = workflowSource.indexOf('name: Publish verified macOS artifacts');

    expect(verificationStep).toBeGreaterThan(buildStep);
    expect(verificationStep).toBeLessThan(publishStep);
    const verificationSource = workflowSource.slice(verificationStep, publishStep);
    expect(verificationSource).toContain('Contents/MacOS/Infilux');
    expect(verificationSource).toContain('Contents/Resources/app.asar');
    expect(verificationSource).toContain('CFBundleShortVersionString');
    expect(verificationSource).toContain('require("./package.json").version');
    expect(verificationSource).toContain('lipo -verify_arch "$binary_arch"');
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
      `gh release upload "$TAG" "${shellExpressionOpen}dmg_files[0]}" "${shellExpressionOpen}zip_files[0]}" "${shellExpressionOpen}dmg_blockmaps[0]}" "${shellExpressionOpen}zip_blockmaps[0]}" --clobber`
    );
    expect(workflowSource.slice(publishStep, metadataUploadStep)).toContain(
      `[[ "${shellExpressionOpen}#dmg_files[@]}" -ne 1 || "${shellExpressionOpen}#zip_files[@]}" -ne 1 || "${shellExpressionOpen}#dmg_blockmaps[@]}" -ne 1 || "${shellExpressionOpen}#zip_blockmaps[@]}" -ne 1 || ! -f dist/latest-mac.yml ]]`
    );
    expect(workflowSource.slice(publishStep, metadataUploadStep)).toContain(
      'dmg_blockmaps=(dist/*.dmg.blockmap)'
    );
    expect(workflowSource.slice(publishStep, metadataUploadStep)).toContain(
      'zip_blockmaps=(dist/*.zip.blockmap)'
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

  it('uses the previous published release rather than a failed or draft tag for notes', () => {
    expect(workflowSource).toContain(
      "gh release list --exclude-drafts --limit 1 --json tagName --jq '.[0].tagName // empty'"
    );
    expect(workflowSource).not.toContain('git tag --sort=-version:refname');
    expect(workflowSource).toContain('PREV_TAG=$(git rev-list --max-parents=0 HEAD)');
  });

  it('passes the actual macOS signing mode to release notes', () => {
    expect(workflowSource).toContain(
      `macos_signed: ${expressionOpen} steps.macos_signing.outputs.ready ${expressionClose}`
    );
    expect(workflowSource).toContain(
      `--macos-signing "${expressionOpen} needs.build-mac.outputs.macos_signed == 'true' && 'signed' || 'unsigned' ${expressionClose}"`
    );
    expect(workflowSource).toContain('scripts/__tests__/generateReleaseNotes.test.ts');
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
