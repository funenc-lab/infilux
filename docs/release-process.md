# Release Process

## Overview

GitHub Releases is the primary publishing path for Infilux.

- `push` a tag matching `v*` to trigger the main release workflow
- The main workflow runs repository quality gates before packaging (`pnpm typecheck`, `pnpm lint`, `pnpm test:coverage`)
- Release workflow and helper regression tests also run before packaging
- GitHub Actions builds platform artifacts and uploads them to the draft GitHub release created by `electron-builder`
- The workflow merges `latest-mac.yml`, verifies remote runtime assets, generates release notes from the uploaded asset list, and publishes the release
- Release notes use the previous published GitHub release, excluding drafts and failed release tags
- Package-manager publication is not part of the GitHub Releases gate and is not advertised as a supported installation path unless it has been explicitly revalidated for the target release

## Automated GitHub Releases Flow

1. Update `package.json` with the target version.
2. Commit the release changes.
3. Create and push the release tag:

```bash
git tag -a v0.4.33 -m "Release v0.4.33"
git push --atomic origin main v0.4.33
```

4. GitHub Actions runs `.github/workflows/build.yml`.
5. The workflow blocks packaging if repository quality gates fail.
6. The workflow uploads the current platform artifacts and refreshes release notes from the actual uploaded filenames.
7. The workflow publishes the GitHub release after verification completes.

Use a new version and tag after a failed release; do not move a published or failed release tag. Packaging uploads macOS assets only to a draft and refuses to replace a published release.

## macOS Signing Policy

Tag-triggered releases build macOS bundles without Apple Developer ID signing for Apple Silicon and Intel by default, even when Apple signing secrets are configured. This unsigned mode disables certificate discovery, notarization, hardened runtime, and DMG signing. Apple Silicon retains the certificate-free ad-hoc signature required to execute ARM64 code; Intel skips signing entirely. No Apple signing credentials are required. Before upload, the workflow verifies the executable, packaged application data, bundle version, architecture, DMG/ZIP files, and their blockmaps. It also verifies ARM64 ad-hoc signatures and runs the packaged executable in Node mode as a basic startup check.

Manual workflow runs can opt into signing with `sign_macos: true`. All required Apple credentials must be present, certificate import must succeed, and the packaged app must retain the original Developer ID team. Explicitly requested signing never falls back silently to unsigned output. The compatible `allow_unsigned_macos` input remains available; setting both inputs to true is rejected.

Unsigned macOS downloads may be blocked by Gatekeeper. Follow [Apple's guidance](https://support.apple.com/en-us/102445) to approve a trusted downloaded app; do not disable system security globally. Install and update these builds manually using the DMG for the correct architecture. Signed-app automatic update requirements mean in-app automatic updates are not supported for unsigned macOS builds. See the [Electron updater requirements](https://www.electronjs.org/docs/latest/api/auto-updater).

Windows, Linux, and managed Linux remote runtime publication are unchanged. The release notes receive the actual macOS signing mode from the build job and disclose unsigned installation restrictions.

## Local Manual Fallback

Use the local path only when the automated release needs repair.

### Repair an existing release asset

```bash
TAG=v0.4.33
gh release upload "$TAG" dist/<artifact-file> --clobber
```

### Regenerate release notes locally

```bash
TAG=v0.4.33
PREV_TAG=$(gh release list --exclude-drafts --limit 100 --json tagName --jq "map(select(.tagName != \"$TAG\"))[0].tagName // empty")
if [ "$PREV_TAG" = "$TAG" ] || [ -z "$PREV_TAG" ]; then
  PREV_TAG=$(git rev-list --max-parents=0 HEAD)
fi

gh release view "$TAG" --json assets --jq '.assets[].name' > release-assets.txt
node scripts/release/generate-release-notes.mjs \
  --tag "$TAG" \
  --previous-tag "$PREV_TAG" \
  --repository "funenc-lab/infilux" \
  --asset-file release-assets.txt \
  --macos-signing unsigned \
  --output release-notes.md
gh release edit "$TAG" --notes-file release-notes.md
```

### Publish local platform artifacts directly

Build on the target platform first, then upload the generated files to the existing GitHub release:

```bash
pnpm build
CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --mac --x64 -c.mac.identity=null -c.mac.notarize=false -c.mac.hardenedRuntime=false -c.dmg.sign=false --publish never
CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --mac --arm64 -c.mac.identity=- -c.mac.notarize=false -c.mac.hardenedRuntime=false -c.dmg.sign=false --publish never
npx electron-builder --win --publish never
npx electron-builder --linux --publish never
```

Upload the required artifacts with `gh release upload` after the local build completes.

## Package Manager Notes

The workflow `.github/workflows/update-package-managers.yml` is a historical manual maintenance helper for external channels that still depend on legacy `EnsoAI` identifiers and repositories.

- It is not triggered by `.github/workflows/build.yml`
- It is not part of the primary GitHub Releases success criteria
- Do not include package-manager channels in public installation docs unless the channel has been revalidated against the current GitHub release artifacts
- Run it manually only after the GitHub release is live and only if you intentionally maintain and verify those external channels
