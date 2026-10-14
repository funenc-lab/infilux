# Unsigned GitHub Release Design

## Goal

Publish Infilux v0.4.33 through GitHub Actions without requiring Apple signing or notarization. Preserve repository quality gates, both macOS architectures, Windows/Linux builds, remote runtime bundles, and draft-only asset uploads.

## Approved Policy

- Tag-triggered macOS builds are unsigned by default, even when Apple secrets exist.
- Manual runs can request signing with `sign_macos: true`. Explicit signing fails if credentials or certificate import are unavailable; it never silently falls back to unsigned output.
- Keep `allow_unsigned_macos` as a compatible manual override. Reject contradictory signed and unsigned requests.
- Unsigned packaging disables certificate discovery, notarization, hardened runtime, and DMG signing. ARM64 uses only the certificate-free ad-hoc signature required by macOS; x64 skips signing. Verify bundle contents, package version, executable architecture, ARM64 signature integrity, and basic executable startup before upload.
- Signed packaging retains Developer ID and original-team verification.
- Release notes disclose the actual signing mode. Unsigned macOS artifacts require user approval in Gatekeeper and manual installation/updates.
- Use the previous published release as the changelog baseline, excluding failed/draft releases.
- Create v0.4.33; do not rewrite failed v0.4.30/v0.4.31/v0.4.32 tags or replace a published release.

## Boundaries

Only release workflow, release helpers/tests, documentation, and the package version change. Concurrent terminal input and scroll work stays in the original workspace and is not part of this release.

## Compatibility Verification

Independent review identified that electron-builder 26.4 skips ARM64 ad-hoc signing when `identity=null`. The installed packager source and [Apple Platform Security](https://help.apple.com/pdf/security/en_US/apple-platform-security-guide.pdf) confirm ARM64 code needs at least a valid ad-hoc signature. Using `identity=-` for ARM64 preserves the approved no-Apple-credentials publishing path without producing a fully unsigned native executable that macOS cannot execute.

The v0.4.31 workflow packaged both macOS targets successfully but correctly blocked publication when the architecture check failed. Local execution reproduced the invalid `lipo -verify_arch <arch> <file>` argument order. Use `lipo <file> -verify_arch <arch>` and run the actual workflow command against a real Mach-O executable before macOS packaging. Retry as v0.4.32 without moving the existing tags.

The v0.4.32 ARM64 regression failed before packaging because its restricted subprocess environment omitted `HOME`, which the runner's Homebrew tools require. Inherit the runner environment and verify the required home-directory context before invoking the real workflow command. Retry as v0.4.33 without moving the existing tags.

## Verification

Exercise the policy through real Node CLI invocations, assert workflow wiring and safeguards, verify generated release notes, and run fresh typecheck/lint/build checks. GitHub Actions must pass full source coverage and every platform job before publication. Confirm public release assets and merged macOS metadata after the workflow finishes.
