# Unsigned GitHub Release Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Publish v0.4.33 on GitHub with unsigned macOS artifacts and intact release safeguards.

**Architecture:** A deterministic Node CLI chooses signing mode. The existing workflow packages and verifies the selected mode, then builds release notes from the previous published release and actual uploaded assets.

**Tech Stack:** GitHub Actions, Node.js ES modules, Vitest, electron-builder 26, pnpm.

---

### Task 1: Test and implement explicit macOS signing policy

**Files:**
- Create `scripts/release/macos-signing-policy.mjs`
- Create `scripts/__tests__/macosSigningPolicy.test.ts`
- Modify `scripts/__tests__/buildWorkflowMacSigning.test.ts`
- Modify `.github/workflows/build.yml`

1. Add CLI regressions for default unsigned mode, credential independence, explicit signing, missing secrets, contradictory flags, invalid flags, and missing output paths.
2. Update workflow assertions for default unsigned releases, retained signed verification, unsigned bundle checks, and CI release-helper tests.
3. Run `pnpm exec vitest run scripts/__tests__/macosSigningPolicy.test.ts scripts/__tests__/buildWorkflowMacSigning.test.ts`; confirm assertion failures before implementation.
4. Implement the policy CLI and wire the workflow. Disable certificate discovery, notarization, hardened runtime, and DMG signing for unsigned builds; retain signed-mode fail-closed checks and asset gates. Preserve required certificate-free ad-hoc signing for ARM64 and validate basic executable startup.
5. Rerun tests until green and review the resulting diff.

### Task 2: Disclose signing mode and preserve complete changelogs

**Files:**
- Modify `scripts/release/releaseMetadata.mjs`
- Modify `scripts/release/generate-release-notes.mjs`
- Modify `scripts/__tests__/releaseMetadata.test.ts`
- Create `scripts/__tests__/generateReleaseNotes.test.ts`
- Modify `.github/workflows/build.yml`
- Modify `docs/release-process.md`

1. Add tests for unsigned installation/update disclosure, unchanged signed defaults, invalid mode rejection, and actual CLI flag propagation.
2. Add workflow assertions that the previous published release excludes drafts and actual signing mode reaches the notes generator.
3. Run focused tests and confirm the new behavior fails before implementation.
4. Implement the optional signing-mode argument, release-note disclosure, previous-published-release selection, and operator documentation.
5. Rerun the focused suite and review.

### Task 3: Verify, commit, and publish v0.4.33

**Files:**
- Modify `package.json` (version only)

1. Set version 0.4.33 without dependency or lockfile changes.
2. Run the release/config regression suite, `pnpm typecheck`, `pnpm lint`, and `pnpm build`; inspect fresh results and request code review.
3. Commit only release files. Fast-forward main without modifying concurrent terminal changes.
4. Verify remote main and tag availability; atomically push main and the new annotated v0.4.33 tag.
5. Monitor the GitHub workflow through all quality and packaging jobs. Confirm public publication, required assets, checksums, release-note disclosure, and both architectures in merged macOS metadata.

## Checkpoints

- Isolation and baseline: complete (existing release/config suite, 19 tests).
- Policy and workflow regressions: complete (including required ARM64 ad-hoc compatibility; RED failures observed before implementation).
- Release notes and documentation: complete (42 release/config tests; new assertions failed before implementation).
- Local verification and review: complete for v0.4.33 (44 release/config tests, inherited macOS environment and real `lipo` regression, typecheck, lint, build, and independent review).
- Commit, push, and public release verification: pending.

## Failed Attempt and Regression

The v0.4.31 workflow passed all repository gates and built both macOS packages, but the new architecture check had an invalid `lipo` argument order and prevented upload/publication. The real macOS CLI reproduced the failure. Add a behavior regression that parses the workflow YAML and executes its architecture-check command against a temporary Mach-O fixture. Run the workflow regressions on both macOS runners before packaging, correct the argument order, and retry as v0.4.32 without rewriting tags.

The v0.4.32 ARM64 workflow annotation identified `Error: $HOME must be set to run brew.` from the regression subprocess. A local regression reproduced failure with the restricted environment. Inherit the runner environment, retain a home-directory precondition and the actual `lipo` command, and retry as v0.4.33 without rewriting tags.
