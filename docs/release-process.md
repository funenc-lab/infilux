# Release Process

## Overview

GitHub Releases is the primary publishing path for Infilux.

- `push` a tag matching `v*` to trigger the main release workflow
- The main workflow runs repository quality gates before packaging (`pnpm typecheck`, `pnpm lint`, `pnpm test`)
- GitHub Actions builds platform artifacts and uploads them to the draft GitHub release created by `electron-builder`
- The workflow merges `latest-mac.yml`, verifies remote runtime assets, generates release notes from the uploaded asset list, and publishes the release
- Package-manager publication is not part of the GitHub Releases gate and is not advertised as a supported installation path unless it has been explicitly revalidated for the target release

## Automated GitHub Releases Flow

1. Update `package.json` with the target version.
2. Commit the release changes.
3. Create and push the release tag:

```bash
git tag v0.2.41
git push origin v0.2.41
```

4. GitHub Actions runs `.github/workflows/build.yml`.
5. The workflow blocks packaging if repository quality gates fail.
6. The workflow uploads the current platform artifacts and refreshes release notes from the actual uploaded filenames.
7. The workflow publishes the GitHub release after verification completes.

## Local Manual Fallback

Use the local path only when the automated release needs repair.

### Repair an existing release asset

```bash
TAG=v0.2.41
gh release upload "$TAG" dist/<artifact-file> --clobber
```

### Regenerate release notes locally

```bash
TAG=v0.2.41
PREV_TAG=$(git tag --sort=-version:refname | grep -A1 "^${TAG}$" | tail -1)
if [ "$PREV_TAG" = "$TAG" ] || [ -z "$PREV_TAG" ]; then
  PREV_TAG=$(git rev-list --max-parents=0 HEAD)
fi

gh release view "$TAG" --json assets --jq '.assets[].name' > release-assets.txt
node scripts/release/generate-release-notes.mjs \
  --tag "$TAG" \
  --previous-tag "$PREV_TAG" \
  --repository "funenc-lab/infilux" \
  --asset-file release-assets.txt \
  --output release-notes.md
gh release edit "$TAG" --notes-file release-notes.md
```

### Publish local platform artifacts directly

Build on the target platform first, then upload the generated files to the existing GitHub release:

```bash
pnpm build
npx electron-builder --mac --publish never
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
