# Stable Progressive Sidebar Loading Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Keep progressive sidebar loading without visible loading text or unexpected directory/viewport repositioning.

**Architecture:** Retain visibility order and budgets within the existing layout hooks, resetting only on an explicit visibility-scope change while honoring manual inventory reordering. Reuse the loading fallback for accessible, position-aware automatic loading and preserve a visible directory anchor before paint.

**Tech Stack:** React 19, TypeScript, Vitest/jsdom, existing renderer layout components.

---

### Task 1: Stabilize repository and group pagination

**Files:**
- Modify: `src/renderer/components/layout/useProgressiveRepositoryVisibility.ts`
- Modify: `src/renderer/components/layout/repositoryVisibilityPolicy.ts`
- Modify: `src/renderer/components/layout/TreeSidebar.tsx`
- Test: `src/renderer/components/layout/__tests__/useProgressiveRepositoryVisibility.test.ts`

1. Extend the hook harness to accept repository inventory and selection. Add tests that load a batch, change the selected repository/access time, and remove an unrelated inventory entry. Assert existing row paths remain in order and loaded rows remain visible. Change the group-inventory regression to retain the surviving group's budget; add a scope-reset regression.
2. Run `pnpm --config.manage-package-manager-versions=false exec vitest run src/renderer/components/layout/__tests__/useProgressiveRepositoryVisibility.test.ts` and verify the new behavioral assertions fail.
3. Replace inventory-based reset keys with scope-based keys. Store displayed paths alongside retained active paths. Prefer already displayed candidates within the inactive budget and order them before newly displayed paths. Honor explicit changes in common inventory paths' relative order. Prune group budgets independently and pass `activeGroupId` as the tree's pagination reset key.
4. Rerun the hook and visibility-policy tests. Verify existing selected/active visibility and search-reset behavior still pass.

Core regression shape:

```ts
await act(async () => snapshot?.showMore());
const previousPaths = snapshot!.repositories.map((repo) => repo.path);
await act(async () => root.render(React.createElement(Harness, { selectedRepo: '/repo/15' })));
expect(snapshot!.repositories.map((repo) => repo.path).slice(0, previousPaths.length)).toEqual(previousPaths);
```

### Task 2: Make loading unobtrusive and viewport-safe

**Files:**
- Modify: `src/renderer/components/layout/RepositoryLoadMoreButton.tsx`
- Test: `src/renderer/components/layout/__tests__/RepositoryLoadMoreButton.test.ts`

1. Change the accessible fallback test to expect an empty visible text label with `aria-label="Load more projects"`. Add DOM regressions for restoring a simulated viewport shift after loading, loading the relevant group control only, and ignoring stationary/upward scroll events.
2. Run `pnpm --config.manage-package-manager-versions=false exec vitest run src/renderer/components/layout/__tests__/RepositoryLoadMoreButton.test.ts` and verify the new tests fail for the intended reasons.
3. Remove both visible text spans. Keep the existing icon, button semantics, focus styles, and accessible label. Check the control's bounds against the scroll viewport before loading. Use a pending directory-row anchor and a layout effect to compensate its displacement after a batch. Use the captured absolute offset only when no anchor survives, including when the final control disappears. Allow renewed downward wheel input at the anchored bottom to load another batch without requiring an intermediate upward scroll.
4. Rerun the loading-control tests and the targeted layout suites.

### Task 3: Verify and hand off the scoped patch

**Files:**
- All files above; plan/design documents only.

1. Run targeted layout tests, `pnpm --config.manage-package-manager-versions=false typecheck`, and scoped Biome checks. Record any pre-existing failures separately.
2. Exercise real browser layout with synthetic repository rows if available; verify selected row viewport offsets stay stable after loading/selecting, including grouped insertion above the selected row. Do not modify installed-app data.
3. Review the diff for unintended source changes, type escapes, user-owned edits, and local/remote path assumptions. Transfer only the scoped patch to the original workspace and rerun its focused tests.
4. Leave the result available for the user without pushing, merging, or overwriting their existing work.
