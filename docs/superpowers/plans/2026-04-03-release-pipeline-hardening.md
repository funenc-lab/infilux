# Release Pipeline Hardening Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the release pipeline safer and more internally consistent by fixing the current blocking test failure, adding release preflight gates, and removing stale legacy package-manager publishing references from the active release path documentation.

**Architecture:** Keep GitHub Releases as the single primary publishing path. Add a dedicated preflight workflow job ahead of platform packaging, repair the session contract mismatch that currently leaves the repository non-green, and convert downstream package-manager automation into an explicit legacy/manual workflow so the main path no longer appears fully wired when it is not.

**Tech Stack:** GitHub Actions, electron-builder, Vitest, TypeScript, Markdown

---

## Chunk 1: Restore green baseline

### Task 1: Fix the SessionManager contract/test mismatch

**Files:**
- Modify: `src/main/services/session/__tests__/SessionManager.test.ts`
- Inspect: `src/main/services/session/SessionManager.ts`

- [ ] **Step 1: Write/update the failing expectation**
- [ ] **Step 2: Run the focused SessionManager test and confirm the current failure**
- [ ] **Step 3: Apply the minimal fix that aligns the contract with current runtime behavior**
- [ ] **Step 4: Re-run the focused test and confirm it passes**

## Chunk 2: Protect the main GitHub Releases path

### Task 2: Add release preflight gates before packaging

**Files:**
- Modify: `.github/workflows/build.yml`

- [ ] **Step 1: Add a preflight job that runs `pnpm typecheck`, `pnpm lint`, and `pnpm test`**
- [ ] **Step 2: Make packaging jobs depend on the preflight job**
- [ ] **Step 3: Keep tag-triggered publish behavior unchanged after preflight passes**

## Chunk 3: Make downstream distribution status explicit

### Task 3: Demote legacy package-manager publishing from active path to manual maintenance only

**Files:**
- Modify: `.github/workflows/update-package-managers.yml`
- Modify: `README.md`
- Modify: `README.zh.md`
- Modify: `docs/release-process.md`

- [ ] **Step 1: Remove automatic invocation expectations and mark the workflow as legacy/manual maintenance**
- [ ] **Step 2: Document that GitHub Releases is the supported primary path and package-manager channels are not part of the main release gate**
- [ ] **Step 3: Preserve legacy identifiers only where operationally required, but stop implying they are first-class current channels**

## Chunk 4: Verify end-to-end repository state

### Task 4: Run verification commands

**Files:**
- No file changes

- [ ] **Step 1: Run focused regression tests**
- [ ] **Step 2: Run `pnpm typecheck`**
- [ ] **Step 3: Run `pnpm lint`**
- [ ] **Step 4: Run `pnpm test`**
- [ ] **Step 5: Run `pnpm build`**
