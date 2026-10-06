# macOS Signing Release Guard Implementation Plan

> Implement each task with a failing policy test before changing the workflow.

**Goal:** Prevent a tagged macOS release from silently replacing the Developer ID-signed app with an unsigned or differently signed bundle.

**Architecture:** The existing GitHub Actions macOS job retains its untagged unsigned test builds. All macOS builds suppress implicit publishing. Tagged builds require successful certificate import before building, then verify the completed app's code signature and its original Developer ID team before uploading DMG, ZIP, and both blockmap artifacts. Downstream release jobs upload merged update metadata and publish the release. No renderer, TCC database, or installed app code changes are needed.

**Tech Stack:** GitHub Actions YAML, bash, macOS `codesign`, Vitest.

---

### Task 1: Reject unsigned tag builds

**Files:**
- Modify: `scripts/__tests__/buildWorkflowMacSigning.test.ts`
- Modify: `.github/workflows/build.yml`

**Step 1: Write failing policy tests.** Require a tagged preflight that rejects `allow_unsigned_macos`, no repository-wide unsigned release override, a tag-only post-import gate, and an unsigned build limited to untagged runs. Preserve the untagged manual override and unsigned fallback assertions.

Require workflow-level concurrency by ref with `cancel-in-progress: false` to prevent a retry from racing against a release being published.

**Step 2: Verify failure.** Run `NODE_OPTIONS=--no-webstorage pnpm exec vitest run scripts/__tests__/buildWorkflowMacSigning.test.ts`; the new tag signing tests must fail against the existing workflow.

**Step 3: Implement the release gate.** In `.github/workflows/build.yml`, reject `WORKFLOW_ALLOW_UNSIGNED_MACOS` for tag refs, remove the `REPO_ALLOW_UNSIGNED_MACOS_RELEASE` bypass, and add a step after certificate import:

```yaml
- name: Require signed macOS release
  if: startsWith(github.ref, 'refs/tags/')
  env:
    SIGNING_READY: ${{ steps.macos_signing.outputs.ready }}
    CERTIFICATE_IMPORTED: ${{ steps.import_apple_certificate.outcome }}
  run: |
    if [[ "$SIGNING_READY" != "true" || "$CERTIFICATE_IMPORTED" != "success" ]]; then
      echo '::error title=Signed macOS release required::Apple certificate import must succeed for a tagged release.'
      exit 1
    fi
```

Restrict the existing unsigned build step to non-tag refs, so no release tag invokes electron-builder with `mac.identity=null`. Pass `--publish never` to signed and unsigned macOS builds; electron-builder v26 otherwise uploads from CI before later checks, and untagged builds can upload to an existing draft.

**Step 4: Verify green.** Run the focused Vitest command and inspect the resulting YAML branch conditions.

### Task 2: Verify signer before final release publication

**Files:**
- Modify: `scripts/__tests__/buildWorkflowMacSigning.test.ts`
- Modify: `.github/workflows/build.yml`

**Step 1: Add a failing test.** Assert the tagged post-build gate calls `codesign --verify --deep --strict`, checks `Authority=Developer ID Application:` and `TeamIdentifier=SG6MVT62JU`, and handles both `dist/mac` and `dist/mac-arm64` app bundles. Require both macOS builder branches to suppress implicit publishing and the explicit upload to follow signature verification.

**Step 2: Verify failure.** Run the focused Vitest command; only the new signer verification test should fail.

**Step 3: Implement the check.** After the signed build and before uploading update metadata, choose the bundle for the matrix architecture, require it to exist, run `codesign --verify --deep --strict --verbose=2`, inspect `codesign --display --verbose=4` output, and fail the job if the Developer ID authority or original team does not match. For `v*` tags, require one DMG, one ZIP, both blockmaps, and update metadata, then explicitly upload only the validated build's packages and blockmaps to GitHub Release. The existing release-notes job merges and uploads update metadata.

**Step 4: Verify green and adjacent gates.** Run the focused Vitest command, `NODE_OPTIONS=--no-webstorage pnpm typecheck`, `NODE_OPTIONS=--no-webstorage pnpm lint`, and `git diff --check`. If full tests are run, report the existing ImageMagick `magick` prerequisite separately.

### Task 3: Signed delivery dependency

Before replacing the local app, an authorized release environment must produce a signed build of the current source and validate it with `codesign`. This host has no available signing identity or GitHub CLI authentication; do not tag/publish a release, grant Full Disk Access, ad-hoc sign the installed app, or reinstall the older signed release as a substitute. Report the remaining external prerequisite explicitly.
