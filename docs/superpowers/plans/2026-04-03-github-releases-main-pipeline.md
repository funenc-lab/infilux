# GitHub Releases Main Pipeline Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the GitHub Releases main publishing pipeline so `push` on `v*` tags publishes the current Infilux artifacts and release notes correctly, while keeping local manual publishing as an emergency path.

**Architecture:** Keep `.github/workflows/build.yml` as the single source of truth for GitHub Releases publishing. Extract release asset naming and release-note generation into a small testable Node script so workflow logic stops hardcoding stale EnsoAI artifact names. Leave downstream package-manager workflows out of scope.

**Tech Stack:** GitHub Actions, electron-builder, Node.js, TypeScript, Vitest

---

## Chunk 1: Release metadata extraction and tests

### Task 1: Add failing tests for release artifact naming and markdown generation

**Files:**
- Create: `scripts/__tests__/releaseMetadata.test.ts`
- Create: `scripts/release/releaseMetadata.ts`
- Modify: `vitest.config.ts`

- [ ] **Step 1: Write the failing test**

Add tests that assert:
1. macOS / Windows / Linux artifact names use the current `Infilux` branding.
2. Linux deb artifact naming remains `infilux_<version>_amd64.deb` if sourced from current packaging output.
3. Generated release notes markdown references the current repository slug and artifact names.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run scripts/__tests__/releaseMetadata.test.ts`
Expected: FAIL because the new module does not exist yet.

- [ ] **Step 3: Write minimal implementation**

Implement a focused helper module that exports:
- typed release asset metadata
- release notes markdown generator
- current GitHub release asset filename list used by the workflow

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run scripts/__tests__/releaseMetadata.test.ts`
Expected: PASS

## Chunk 2: Wire workflow to the tested metadata

### Task 2: Replace hardcoded legacy asset names in GitHub Releases workflow

**Files:**
- Modify: `.github/workflows/build.yml`
- Modify: `.github/workflows/release-notes.yml`
- Create: `scripts/release/generate-release-notes.mjs`

- [ ] **Step 1: Write the failing test**

Extend `scripts/__tests__/releaseMetadata.test.ts` with a fixture-oriented assertion that the generator output contains all expected artifact labels and URLs for a sample tag/version/repository.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run scripts/__tests__/releaseMetadata.test.ts`
Expected: FAIL because generator output is not yet wired to the tested path.

- [ ] **Step 3: Write minimal implementation**

Update workflows to call the generator script instead of inline heredoc logic for release-note download rows. Keep:
- tag push auto publish
- `workflow_dispatch` manual rerun support
- merged `latest-mac.yml` upload
- release draft finalize in `build.yml`

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run scripts/__tests__/releaseMetadata.test.ts`
Expected: PASS

## Chunk 3: Document the local manual fallback path

### Task 3: Document the GitHub Releases publish flow and local manual fallback

**Files:**
- Modify: `README.md`
- Modify: `README.zh.md`

- [ ] **Step 1: Write the failing test**

Not applicable for documentation-only changes.

- [ ] **Step 2: Write minimal implementation**

Document:
- tag push auto-release entrypoint
- GitHub Actions as the main release path
- local manual fallback commands for emergency publication / repair
- scope note that package-manager workflows are separate

- [ ] **Step 3: Review docs for consistency**

Verify the docs use `Infilux` branding and current repository slug.

## Chunk 4: Verification

### Task 4: Run verification commands

**Files:**
- No file changes

- [ ] **Step 1: Run focused tests**

Run: `pnpm vitest run scripts/__tests__/releaseMetadata.test.ts src/main/services/updater/__tests__/AutoUpdater.test.ts`
Expected: PASS

- [ ] **Step 2: Run project quality gates**

Run:
- `pnpm typecheck`
- `pnpm lint`
- `pnpm test`

Expected: PASS
