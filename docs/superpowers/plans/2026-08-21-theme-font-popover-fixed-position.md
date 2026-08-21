# Theme Font Popover Fixed Position Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the editor content width stable while the theme font selector popover is open.

**Architecture:** Preserve the shared Base UI Popover composition and expose its `positionMethod` through the local `PopoverPopup` wrapper. The font selector opts into a viewport-fixed positioner so its wide popup cannot expand the document's horizontal scrollable area; all other popovers retain their current positioning behavior.

**Tech Stack:** React 19, TypeScript, Base UI Popover, Tailwind CSS 4, Vitest, jsdom.

## Global Constraints

- Keep the font chooser as an accessible Base UI Popover with portal, focus management, keyboard navigation, and collision handling.
- Do not change the existing editor, settings persistence, or font-selection contracts.
- Add a regression test for the visible positioning behavior before modifying production code.
- Keep new source text and code comments in English.

---

### Task 1: Use viewport-fixed positioning for the font popover

**Files:**
- Modify: `src/renderer/components/ui/popover.tsx:15-64`
- Modify: `src/renderer/components/settings/FontFamilyPresetSelect.tsx:163-172`
- Modify: `src/renderer/components/settings/__tests__/FontFamilyPresetSelect.test.ts:75-110`

**Interfaces:**
- Consumes: `PopoverPrimitive.Positioner.Props['positionMethod']` from Base UI.
- Produces: `PopoverPopup` accepts an optional `positionMethod` prop and forwards it to `PopoverPrimitive.Positioner`.
- Uses: `FontFamilyPresetSelect` passes `positionMethod="fixed"` to its existing `PopoverPopup`.

- [x] **Step 1: Write the failing regression test**

Extend `keeps the popup compact and filters results without showing CSS fallback stacks` so, after opening the selector, it finds the positioner with `popup?.parentElement` and asserts:

```typescript
expect(popup?.parentElement?.style.position).toBe('fixed');
```

The production change that must make this fail is removing the font selector's fixed positioning, which would allow the wide popup to contribute to document overflow again.

- [x] **Step 2: Run the focused test to verify it fails**

Run: `pnpm vitest run src/renderer/components/settings/__tests__/FontFamilyPresetSelect.test.ts`

Expected: the compact-popup test fails because the Base UI positioner uses the default `absolute` position method.

- [x] **Step 3: Implement the minimum production change**

In `PopoverPopup`, destructure an optional `positionMethod` typed as `PopoverPrimitive.Positioner.Props['positionMethod']`, then pass it to `PopoverPrimitive.Positioner`. In `FontFamilyPresetSelect`, pass `positionMethod="fixed"` to the existing `PopoverPopup`. Do not alter popup size, portal use, option filtering, or keyboard handlers.

- [x] **Step 4: Run the focused test to verify it passes**

Run: `pnpm vitest run src/renderer/components/settings/__tests__/FontFamilyPresetSelect.test.ts`

Expected: all font selector tests pass, including the fixed-position regression assertion.

- [ ] **Step 5: Run renderer type and style checks**

Run: `pnpm typecheck && pnpm lint`

Expected: both commands exit with status `0`.

**Verification note:** `pnpm typecheck` passed. The full lint command was blocked before its later checks by an existing formatting error in `.launch-code/state.json`; the touched-file Biome check, renderer theme color audit, and test quality audit passed. The full test suite completed with two unrelated `src/main/__tests__/index.test.ts` failures because the test environment reported an already-enabled `remote-debugging-port` switch.

---

### Task 2: Measure the font popup at its rendered size for collision avoidance

**Files:**
- Modify: `src/renderer/components/ui/popover.tsx:35-43`
- Modify: `src/renderer/components/settings/__tests__/FontFamilyPresetSelect.test.ts:86-132`

**Interfaces:**
- Consumes: the existing `PopoverPrimitive.Positioner` element rendered by `PopoverPopup`.
- Produces: a content-sized positioner so Base UI collision calculations use the actual popup bounds.
- Preserves: the existing `positionMethod="fixed"` consumer contract for the font selector.

- [x] **Step 1: Write the failing regression test**

Add a focused font-selector test that opens the popup, retrieves the positioner through `popup?.parentElement`, and asserts that the rendered positioner includes both `w-fit` and `h-fit` classes. The production change that must make this fail is restoring the width or height constraints based on `--positioner-width` or `--positioner-height`, which makes collision avoidance measure the trigger instead of the visible popup.

- [x] **Step 2: Run the focused test to verify it fails**

Run: `pnpm vitest run src/renderer/components/settings/__tests__/FontFamilyPresetSelect.test.ts`

Expected: the new positioning-bounds test fails because the positioner currently has `w-(--positioner-width)` and `h-(--positioner-height)`.

- [x] **Step 3: Implement the minimum production change**

Replace the shared popover positioner's width and height classes with `w-fit` and `h-fit`, retaining its `max-w-(--available-width)`, z-index, transition, and positioning props.

- [x] **Step 4: Run the focused test and verify a live viewport boundary**

Run: `pnpm vitest run src/renderer/components/settings/__tests__/FontFamilyPresetSelect.test.ts`

Then use the Electron CDP development instance to open the font popup and assert `popup.getBoundingClientRect().left >= 0` and `popup.getBoundingClientRect().right <= window.innerWidth`.

**Verification result:** The focused Vitest suite passed 5/5. In the 1400 × 900 Electron development viewport, the reopened popup measured `left=932.6`, `right=1344.2`, `top=369.6`, and `bottom=644.0`, so all bounds were inside the viewport.
