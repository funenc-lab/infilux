# Sidebar Performance And Recent Projects Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make both sidebars responsive and progressively render inactive projects by recent access while preserving active context, grouping, manual order, search, and keyboard behavior.

**Architecture:** Move hover-reveal state into an isolated layout controller and use compositor-only transitions. Persist repository access time in the existing repository record, then use a pure visibility policy plus a shared hook and button to select a bounded project set without changing stored order.

**Tech Stack:** React 19, TypeScript 5.9, Framer Motion, Zustand activity state, Vitest, jsdom, Tailwind CSS 4.

## Global Constraints

- Generated TypeScript, JavaScript, CSS-adjacent source, and code comments must contain English only.
- Keep existing Repository storage compatible; `lastAccessedAt` remains optional for legacy records.
- Show all active projects plus 8 inactive projects initially; add 8 inactive projects per request.
- Keep existing grouping and persisted manual row order.
- Search shows every matching project and does not permanently expand the inactive budget.
- Animate sidebar reveal with `transform` and `opacity`, never `width`, `height`, `left`, or `right`.
- Preserve keyboard focus, reduced motion, local and remote paths, and sidebar Portal menus.
- Do not modify or commit unrelated tray asset and packaging changes.

## File Structure

- Create `src/renderer/components/layout/SidebarHoverRevealGroup.tsx`: isolated hover, focus, window, and Portal reveal controller.
- Modify `src/renderer/components/layout/sidebarHoverRevealPolicy.ts`: keep floating track width fixed.
- Modify `src/renderer/App.tsx`: consume the controller and remove root-level reveal state.
- Modify `src/renderer/styles/globals.css`: open floating content from group state.
- Modify `src/renderer/components/files/FileSidebar.tsx`: use compositor-only entry/exit motion.
- Modify `src/renderer/App/constants.ts`: add `Repository.lastAccessedAt`.
- Create `src/renderer/App/repositoryAccess.ts`: normalize and update access timestamps.
- Modify `src/renderer/App/hooks/useRepositoryState.ts`: persist access timestamps through all selection and add flows.
- Create `src/renderer/components/layout/recentRepositoryVisibilityPolicy.ts`: pure active/recent visibility selection.
- Create `src/renderer/components/layout/useRecentRepositoryVisibility.ts`: own the 8-item budget and retained visible paths.
- Create `src/renderer/components/layout/ShowMoreProjectsButton.tsx`: shared accessible inline action.
- Modify `src/renderer/components/layout/TreeSidebar.tsx`: apply visibility before sections, prefetch, and diff scopes.
- Modify `src/renderer/components/layout/RepositorySidebar.tsx`: apply the same visibility and group-count semantics.
- Add focused tests beside every new policy and component.

---

### Task 1: Isolate Hover Reveal And Fix Floating Track Layout

**Files:**
- Create: `src/renderer/components/layout/SidebarHoverRevealGroup.tsx`
- Modify: `src/renderer/components/layout/sidebarHoverRevealPolicy.ts`
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/styles/globals.css`
- Test: `src/renderer/components/layout/__tests__/SidebarHoverRevealGroup.integration.test.ts`
- Test: `src/renderer/components/layout/__tests__/sidebarHoverRevealPolicy.test.ts`
- Test: `src/renderer/components/layout/__tests__/sidebarHoverRevealStylePolicy.test.ts`

**Interfaces:**
- Produces: `SidebarHoverRevealGroup({ enabled, children }: { enabled: boolean; children: ReactNode })`.
- Produces: floating `SidebarHoverRevealFrame.trackWidth` fixed to `SIDEBAR_HOVER_REVEAL_TRIGGER_WIDTH`.
- Consumes: existing open/close helpers from `sidebarHoverRevealPolicy.ts`.

- [ ] **Step 1: Finish the failing component tests**

Rename the existing `.test.tsx` draft to `.test.ts` so Vitest collects it. Assert that pointer entry changes `data-sidebar-hover-reveal-state` to `open`, does not rerender a stable child, and pointer transfer into `[data-sidebar-floating-menu-portal="true"]` remains open.

- [ ] **Step 2: Run tests to verify RED**

Run:

```bash
COREPACK_ENABLE_DOWNLOAD_PROMPT=0 pnpm vitest run \
  src/renderer/components/layout/__tests__/SidebarHoverRevealGroup.integration.test.ts \
  src/renderer/components/layout/__tests__/sidebarHoverRevealPolicy.test.ts
```

Expected: FAIL because the controller does not exist and active floating frames return the full panel width.

- [ ] **Step 3: Implement the isolated controller**

Implement a component with local `active` state and a stable `children` boundary. Use `onPointerEnter`, `onPointerMove`, `onPointerLeave`, `onFocusCapture`, and `onBlurCapture`. Treat a related target under `[data-sidebar-floating-menu-portal="true"]` as managed by the sidebar. Keep window focus, blur, and visibility listeners inside this component.

The public state must be exposed only as:

```tsx
data-sidebar-hover-reveal-group={enabled ? 'active' : undefined}
data-sidebar-hover-reveal-state={enabled ? (active ? 'open' : 'closed') : undefined}
```

- [ ] **Step 4: Keep the floating wrapper width fixed**

Change the floating frame result to:

```ts
{
  layoutWidth: 0,
  trackWidth: SIDEBAR_HOVER_REVEAL_TRIGGER_WIDTH,
  triggerWidth: SIDEBAR_HOVER_REVEAL_TRIGGER_WIDTH,
  panelWidth: expandedWidth,
  floating: true,
  visible: hoverRevealActive,
}
```

Move group class and custom-property ownership from `App.tsx` into `SidebarHoverRevealGroup`. Remove `floatingSidebarActive` and all reveal event effects from `App`. Replace the raw group `<div>` with the controller.

- [ ] **Step 5: Switch the CSS open selector to group state**

Use the group state selector rather than per-rail state:

```css
.control-sidebar-hover-reveal-group[data-sidebar-hover-reveal-state='open']
  .control-sidebar-hover-rail[data-sidebar-hover-reveal='active']
  > [data-sidebar-hover-content='true']
```

Keep the existing transform, opacity, pointer-event, theme, and reduced-motion declarations.

- [ ] **Step 6: Run focused tests and commit**

Run the three Task 1 test files. Expected: PASS.

Commit only Task 1 files:

```bash
git commit -m "perf(sidebar): isolate hover reveal rendering"
```

### Task 2: Remove File Sidebar Width Animation

**Files:**
- Modify: `src/renderer/components/files/FileSidebar.tsx`
- Test: `src/renderer/components/files/__tests__/FileSidebar.integration.test.ts`

**Interfaces:**
- Produces: expanded file sidebar with fixed `style.width` and motion values limited to `opacity` and `x`.

- [ ] **Step 1: Run the existing compositor-motion test to verify RED**

Run:

```bash
COREPACK_ENABLE_DOWNLOAD_PROMPT=0 pnpm vitest run \
  src/renderer/components/files/__tests__/FileSidebar.integration.test.ts
```

Expected: FAIL because `initial`, `animate`, and `exit` include `width`.

- [ ] **Step 2: Implement compositor-only motion**

Keep `style={{ width }}` and use:

```tsx
initial={{ opacity: 0, x: -8 }}
animate={{ opacity: 1, x: 0 }}
exit={{ opacity: 0, x: -8 }}
```

Use the existing transition token and preserve the resize handle and collapsed rail.

- [ ] **Step 3: Run the focused test and commit**

Expected: all FileSidebar integration tests PASS.

```bash
git commit -m "perf(files): avoid sidebar width animation"
```

### Task 3: Persist Repository Access Time

**Files:**
- Modify: `src/renderer/App/constants.ts`
- Create: `src/renderer/App/repositoryAccess.ts`
- Create: `src/renderer/App/__tests__/repositoryAccess.test.ts`
- Modify: `src/renderer/App/hooks/useRepositoryState.ts`
- Modify: `src/renderer/App/hooks/__tests__/useRepositoryState.test.ts`

**Interfaces:**
- Produces: `Repository.lastAccessedAt?: number`.
- Produces: `touchRepositoryAccess(repositories: Repository[], repoPath: string, accessedAt: number): Repository[]`.
- Produces: `normalizeRepositoryLastAccessedAt(value: unknown): number | undefined`.
- Preserves: `setSelectedRepo(repoPath: string | null): void` external hook interface.

- [ ] **Step 1: Write failing timestamp policy tests**

Cover exact path normalization, invalid timestamps, no-op for unknown paths, immutable update of the matched Repository, and preservation of list order.

Example expectation:

```ts
expect(touchRepositoryAccess(repositories, '/repo-b/', 200)).toEqual([
  repositories[0],
  { ...repositories[1], lastAccessedAt: 200 },
]);
```

- [ ] **Step 2: Run timestamp tests to verify RED**

Expected: FAIL because the module and field do not exist.

- [ ] **Step 3: Implement normalization and immutable touch logic**

Return `undefined` for non-number, non-finite, or negative timestamps. Reuse the existing normalized path comparison and return the original array when no Repository changes.

- [ ] **Step 4: Write failing hook persistence tests**

Assert that selecting an existing Repository, selecting the same Repository again, adding a new Repository, and selecting a duplicate Repository all persist a finite `lastAccessedAt` without reordering records.

- [ ] **Step 5: Integrate access persistence**

Rename the internal React setter to `setSelectedRepoState`. Return a callback named `setSelectedRepo` that touches Repository access using `Date.now()`, persists through the existing localStorage sync path, and then updates selection. Add new records with `lastAccessedAt: Date.now()`.

During legacy hydration, normalize valid timestamps and omit invalid values. When restoring the saved selected Repository, touch only that record with the current time.

- [ ] **Step 6: Run focused tests and commit**

Run repository access and repository hook tests. Expected: PASS.

```bash
git commit -m "feat(repository): track recent project access"
```

### Task 4: Add The Recent Visibility Policy And Shared UI

**Files:**
- Create: `src/renderer/components/layout/recentRepositoryVisibilityPolicy.ts`
- Create: `src/renderer/components/layout/__tests__/recentRepositoryVisibilityPolicy.test.ts`
- Create: `src/renderer/components/layout/useRecentRepositoryVisibility.ts`
- Create: `src/renderer/components/layout/__tests__/useRecentRepositoryVisibility.test.ts`
- Create: `src/renderer/components/layout/ShowMoreProjectsButton.tsx`
- Create: `src/renderer/components/layout/__tests__/ShowMoreProjectsButton.test.ts`
- Modify: `src/renderer/styles/globals.css`

**Interfaces:**
- Produces: `RECENT_REPOSITORY_BATCH_SIZE = 8`.
- Produces: `resolveRecentRepositoryVisibility(input): { repositories: Repository[]; hiddenCount: number; nextBatchSize: number }`.
- Produces: `useRecentRepositoryVisibility(input): { repositories: Repository[]; hiddenCount: number; showMore(): void }`.
- Produces: `ShowMoreProjectsButton({ hiddenCount, onShowMore })`.

- [ ] **Step 1: Write failing pure policy tests**

Use at least 12 literal Repository fixtures. Verify:

- all active and selected paths are visible;
- exactly 8 inactive paths are selected by descending valid `lastAccessedAt`;
- output order still matches input order;
- missing/equal timestamps fall back to input order;
- retained paths remain visible after activity stops;
- `searchActive: true` returns every input Repository;
- `hiddenCount` and `nextBatchSize` use inactive counts.

- [ ] **Step 2: Run policy tests to verify RED**

Expected: FAIL because the policy is missing.

- [ ] **Step 3: Implement the pure policy**

Select candidate paths by recency but produce output using `repositories.filter(...)`. Active, selected, and retained paths do not consume `inactiveLimit`. Clamp the limit to a non-negative integer.

- [ ] **Step 4: Write and implement hook lifecycle tests**

Verify initial limit 8, `showMore()` adds 8, active paths are retained after they become inactive, and a repository signature change resets the limit and retained paths. Search must bypass the limit without adding search-only paths to retention.

- [ ] **Step 5: Write and implement the shared button test**

Render a real button and assert accessible name `Show 8 more projects`, visible remaining copy, click behavior, and omission when `hiddenCount` is zero. Use `ChevronDown` and existing sidebar row tokens; do not add a card or fixed Footer action.

- [ ] **Step 6: Run focused tests and commit**

Expected: policy, hook, and button tests PASS.

```bash
git commit -m "feat(sidebar): add recent project visibility"
```

### Task 5: Integrate Progressive Projects Into Both Sidebars

**Files:**
- Modify: `src/renderer/components/layout/TreeSidebar.tsx`
- Modify: `src/renderer/components/layout/RepositorySidebar.tsx`
- Modify: `src/renderer/components/layout/__tests__/treeSidebarAgentFilter.test.ts`
- Modify: `src/renderer/components/layout/__tests__/repositorySidebarHiddenRepositories.test.ts`
- Modify: `src/renderer/components/layout/__tests__/sidebarWorktreePrefetchPolicy.test.ts`
- Modify: `src/shared/i18n.ts` only for new English source keys if no existing equivalent exists.

**Interfaces:**
- Consumes: `useRecentRepositoryVisibility` and `ShowMoreProjectsButton` from Task 4.
- Consumes: existing `activePathSet`, `allRepoWorktreesMap`, and selected Repository path.
- Produces: identical progressive visibility behavior in tree and column layouts.

- [ ] **Step 1: Write failing integration tests**

For each sidebar, render 12 or more projects and assert that all active projects plus 8 inactive projects appear, hidden rows do not, and the show-more control reveals the next batch. Assert search reveals a hidden match.

For TreeSidebar, expand a hidden Repository fixture and assert its path is absent from worktree prefetch inputs and diff-stat visible paths until it becomes visible.

- [ ] **Step 2: Run integration tests to verify RED**

Expected: FAIL because both sidebars still render their complete filtered Repository sets.

- [ ] **Step 3: Derive active Repository paths**

Build a normalized active Repository path set from the selected path and any Repository whose own path or hydrated worktree path intersects `activePathSet`. Keep temporary workspace rows outside the inactive budget.

- [ ] **Step 4: Apply progressive visibility before rendering and prefetch**

Keep the existing filter result as the eligible set. Pass it to the shared hook, then use the returned Repository array for grouped sections, flat rows, worktree prefetch, and diff-stat scopes. Preserve total group counts from the eligible set rather than the paginated set.

- [ ] **Step 5: Add the inline show-more action**

Place `ShowMoreProjectsButton` after the grouped or flat list inside the scrolling list body and before the fixed Footer. Do not wrap it in `LayoutGroup` or a height animation.

- [ ] **Step 6: Run focused integration tests and commit**

Expected: both layout modes PASS with identical visibility and no hidden prefetch.

```bash
git commit -m "perf(sidebar): progressively render recent projects"
```

### Task 6: Final Regression And Performance Verification

**Files:**
- Verify all files changed by Tasks 1-5.
- Preserve unrelated working-tree files exactly as found.

- [ ] **Step 1: Run focused regression suites**

```bash
COREPACK_ENABLE_DOWNLOAD_PROMPT=0 pnpm vitest run \
  src/renderer/components/layout/__tests__/sidebarHoverRevealPolicy.test.ts \
  src/renderer/components/layout/__tests__/SidebarHoverRevealGroup.integration.test.ts \
  src/renderer/components/files/__tests__/FileSidebar.integration.test.ts \
  src/renderer/App/__tests__/repositoryAccess.test.ts \
  src/renderer/App/hooks/__tests__/useRepositoryState.test.ts \
  src/renderer/components/layout/__tests__/recentRepositoryVisibilityPolicy.test.ts \
  src/renderer/components/layout/__tests__/useRecentRepositoryVisibility.test.ts \
  src/renderer/components/layout/__tests__/ShowMoreProjectsButton.test.ts
```

- [ ] **Step 2: Run repository quality gates**

```bash
COREPACK_ENABLE_DOWNLOAD_PROMPT=0 pnpm typecheck
COREPACK_ENABLE_DOWNLOAD_PROMPT=0 pnpm exec biome check \
  src/renderer/App/constants.ts \
  src/renderer/App/repositoryAccess.ts \
  src/renderer/App/hooks/useRepositoryState.ts \
  src/renderer/App.tsx \
  src/renderer/components/files/FileSidebar.tsx \
  src/renderer/components/layout/SidebarHoverRevealGroup.tsx \
  src/renderer/components/layout/ShowMoreProjectsButton.tsx \
  src/renderer/components/layout/recentRepositoryVisibilityPolicy.ts \
  src/renderer/components/layout/useRecentRepositoryVisibility.ts \
  src/renderer/components/layout/sidebarHoverRevealPolicy.ts \
  src/renderer/components/layout/TreeSidebar.tsx \
  src/renderer/components/layout/RepositorySidebar.tsx \
  src/renderer/styles/globals.css \
  src/renderer/App/__tests__/repositoryAccess.test.ts \
  src/renderer/App/hooks/__tests__/useRepositoryState.test.ts \
  src/renderer/components/files/__tests__/FileSidebar.integration.test.ts \
  src/renderer/components/layout/__tests__/SidebarHoverRevealGroup.integration.test.ts \
  src/renderer/components/layout/__tests__/recentRepositoryVisibilityPolicy.test.ts \
  src/renderer/components/layout/__tests__/useRecentRepositoryVisibility.test.ts \
  src/renderer/components/layout/__tests__/ShowMoreProjectsButton.test.ts
git diff --check
```

Expected: all commands exit 0 with no diagnostics in changed files.

- [ ] **Step 3: Build and launch a debug instance**

Enable CDP only through the existing conditional environment flag, start an isolated dev instance, and use Playwright to exercise both sidebar modes with at least 16 Repository fixtures or the current real project set.

Capture before/after React child render counts and confirm that hover reveal changes only group state. Record a Performance trace and verify sidebar animation frames do not mutate layout width.

- [ ] **Step 4: Perform visual and interaction review**

Verify dark mode, narrow width, keyboard focus, reduced motion, grouped and ungrouped views, search, remaining count, Portal menus, selected project retention, and fixed Footer hierarchy. Confirm no overlap between floating sidebar, show-more row, file sidebar, and main content.

- [ ] **Step 5: Review final diff and report**

Confirm `git status --short` contains only intended task files plus untouched pre-existing user changes. Summarize commits, verification output, diagnostics path, and any residual main-process CPU issue separately from the renderer fix.
