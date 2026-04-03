import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workflowSource = readFileSync('.github/workflows/build.yml', 'utf8');
const expressionOpen = '$' + '{{';
const expressionClose = '}}';
const appleApiIssuer = `APPLE_API_ISSUER: ${expressionOpen} secrets.APPLE_API_ISSUER ${expressionClose}`;
const appleApiKey = `APPLE_API_KEY: ${expressionOpen} secrets.APPLE_API_KEY ${expressionClose}`;
const appleApiKeyP8 = `APPLE_API_KEY_P8: ${expressionOpen} secrets.APPLE_API_KEY_P8 ${expressionClose}`;
const appleSigningIdentity = `APPLE_SIGNING_IDENTITY: ${expressionOpen} secrets.APPLE_SIGNING_IDENTITY ${expressionClose}`;
const allowUnsignedMacosRelease = `REPO_ALLOW_UNSIGNED_MACOS_RELEASE: ${expressionOpen} vars.ALLOW_UNSIGNED_MACOS_RELEASE ${expressionClose}`;
const fallbackAllowedLiteral = ['fallback_allowed=', '$', '{allow_unsigned}'].join('');
const macArchPlaceholder = '$' + '{{ matrix.arch }}';
const ghReleaseUploadArrayLiteral = [
  'gh release upload "$TAG" "',
  '$',
  '{files[@]}" --clobber',
].join('');

describe('build workflow macOS signing policy', () => {
  it('reuses the penpad-style Apple signing secret names and unsigned release override', () => {
    expect(workflowSource).toContain('allow_unsigned_macos:');
    expect(workflowSource).toContain(appleApiIssuer);
    expect(workflowSource).toContain(appleApiKey);
    expect(workflowSource).toContain(appleApiKeyP8);
    expect(workflowSource).toContain(appleSigningIdentity);
    expect(workflowSource).toContain(allowUnsignedMacosRelease);
  });

  it('supports unsigned macOS fallback when signing prerequisites are missing or invalid', () => {
    expect(workflowSource).toContain('Validate Apple signing identity');
    expect(workflowSource).toContain("grep -F 'Developer ID Application:'");
    expect(workflowSource).toContain('Apple signing configuration is invalid');
    expect(workflowSource).toContain(fallbackAllowedLiteral);
    expect(workflowSource).toContain(
      `ALLOW_UNSIGNED_MACOS: ${expressionOpen} steps.macos_signing.outputs.fallback_allowed ${expressionClose}`
    );
    expect(workflowSource).toContain(`Build macOS (${macArchPlaceholder}) unsigned`);
    expect(workflowSource).toContain("CSC_IDENTITY_AUTO_DISCOVERY: 'false'");
    expect(workflowSource).toContain('-c.mac.identity=null -c.mac.notarize=false');
  });

  it('requires an explicit Apple signing identity for signed macOS builds', () => {
    expect(workflowSource).toContain('missing+=("APPLE_SIGNING_IDENTITY")');
    expect(workflowSource).toContain(
      `CSC_NAME: ${expressionOpen} secrets.APPLE_SIGNING_IDENTITY ${expressionClose}`
    );
    expect(workflowSource).toContain("steps.macos_identity.outputs.ready == 'true'");
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

  it('uploads platform release assets to the current tag instead of publishing to the app version release', () => {
    expect(workflowSource).toContain('npx electron-builder --win --x64 --publish never');
    expect(workflowSource).toContain('npx electron-builder --linux --x64 --publish never');
    expect(workflowSource).toContain(
      `npx electron-builder --mac --${macArchPlaceholder} --publish never`
    );
    expect(workflowSource).toContain('Upload Windows release assets');
    expect(workflowSource).toContain('Upload Linux release assets');
    expect(workflowSource).toContain(`Upload macOS (${macArchPlaceholder}) release assets`);
    expect(workflowSource).toContain(ghReleaseUploadArrayLiteral);
  });
});
