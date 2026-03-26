# App Icon Redesign Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current app icon assets with the approved continuous-ribbon direction and regenerate shipped desktop icon outputs.

**Architecture:** Keep the existing asset pipeline intact. Redraw the source SVG assets to match the approved visual system, then reuse `scripts/generate-logo-assets.sh` to produce platform outputs and update tests so the source-of-truth assets remain locked to the chosen direction.

**Tech Stack:** SVG, ImageMagick, iconutil, Electron Builder, Vitest

---

## File Structure

- Modify: `src/renderer/assets/logo.svg`
  Responsibility: Main cross-platform app icon source.
- Modify: `src/renderer/assets/logo-mac.svg`
  Responsibility: macOS-specific icon source with larger safe margins.
- Modify: `src/renderer/assets/logo-mono.svg`
  Responsibility: Monochrome tray template source.
- Modify: `src/renderer/assets/__tests__/logoMacSvg.test.ts`
  Responsibility: Lock the macOS source icon composition to the approved design.
- Create: `src/renderer/assets/__tests__/logoSvgAssets.test.ts`
  Responsibility: Lock the shared and mono SVG assets to the approved design direction.
- Regenerate: `build/icon.png`, `build/icon.icns`, `build/icon.ico`, `build/icons/*`, `build/tray/*`, `docs/assets/logo.png`, `src/renderer/assets/logo.png`
  Responsibility: Generated outputs consumed by packaging, docs, and renderer previews.

## Chunk 1: Source SVG Redesign

### Task 1: Redraw the shared app icon source

**Files:**
- Modify: `src/renderer/assets/logo.svg`

- [ ] **Step 1: Review the approved spec and current asset**

Read:
- `docs/superpowers/specs/2026-03-26-app-icon-redesign-design.md`
- `src/renderer/assets/logo.svg`

Expected: Confirm the target direction is `Continuous Ribbon + Soft Continuity + Atmospheric Field + Steel Mono Accent + Refined Thin`.

- [ ] **Step 2: Replace the shared SVG composition**

Implement:
- A continuous infinity ribbon, not dual circles
- Soft continuity with no explicit handoff event
- Atmospheric field background with restrained depth
- Steel/slate palette with subtle cold-blue accent
- Refined thin stroke that still survives desktop icon use

- [ ] **Step 3: Sanity-check the SVG text**

Run:
```bash
sed -n '1,220p' src/renderer/assets/logo.svg
```

Expected: No Chinese text, no accidental malformed SVG, no legacy dual-ring elements.

### Task 2: Redraw the macOS-specific icon source

**Files:**
- Modify: `src/renderer/assets/logo-mac.svg`

- [ ] **Step 1: Preserve the macOS safe-area strategy**

Keep:
- 1024 canvas
- Transparent outer area
- Centered icon tile with breathing room

- [ ] **Step 2: Port the new ribbon system into the mac container**

Implement:
- Same symbol language as `logo.svg`
- Same material direction
- Slightly more centered and conservative composition for macOS

- [ ] **Step 3: Check source consistency**

Run:
```bash
sed -n '1,220p' src/renderer/assets/logo-mac.svg
```

Expected: Same approved brand direction, no leftover two-ring composition.

### Task 3: Redraw the monochrome tray asset

**Files:**
- Modify: `src/renderer/assets/logo-mono.svg`

- [ ] **Step 1: Remove all atmospheric and color-dependent structure**

Implement a single-color ribbon-only version suitable for tray templating.

- [ ] **Step 2: Keep the silhouette continuous and non-goggle-like**

Expected: The mono icon still reads as continuous infinity flow, not binoculars.

---

## Chunk 2: Tests and Generated Outputs

### Task 4: Update SVG tests

**Files:**
- Modify: `src/renderer/assets/__tests__/logoMacSvg.test.ts`
- Create: `src/renderer/assets/__tests__/logoSvgAssets.test.ts`

- [ ] **Step 1: Update the mac test to the new composition**

Assert:
- mac safe area still exists
- centered tile exists
- ribbon path exists
- legacy two-circle markers are absent

- [ ] **Step 2: Add shared/mono asset assertions**

Assert:
- `logo.svg` contains the new tile + ribbon composition
- `logo-mono.svg` contains a mono ribbon path
- legacy circle-based composition is absent

- [ ] **Step 3: Run the targeted test file(s)**

Run:
```bash
pnpm vitest run src/renderer/assets/__tests__/logoMacSvg.test.ts src/renderer/assets/__tests__/logoSvgAssets.test.ts
```

Expected: PASS

### Task 5: Regenerate exported icon assets

**Files:**
- Regenerate: `build/icon.png`
- Regenerate: `build/icon.icns`
- Regenerate: `build/icon.ico`
- Regenerate: `build/icons/*`
- Regenerate: `build/tray/*`
- Regenerate: `docs/assets/logo.png`
- Regenerate: `src/renderer/assets/logo.png`

- [ ] **Step 1: Run the existing generation script**

Run:
```bash
./scripts/generate-logo-assets.sh
```

Expected: All platform icon outputs regenerated from the updated SVG sources.

- [ ] **Step 2: Spot-check generated files**

Run:
```bash
identify build/icon.png build/icons/16x16.png build/icons/32x32.png build/icons/64x64.png
```

Expected: Files exist and resolve at expected dimensions.

---

## Chunk 3: Verification

### Task 6: Run final verification

**Files:**
- Verify only

- [ ] **Step 1: Re-run targeted asset tests**

Run:
```bash
pnpm vitest run src/renderer/assets/__tests__/logoMacSvg.test.ts src/renderer/assets/__tests__/logoSvgAssets.test.ts
```

Expected: PASS

- [ ] **Step 2: Inspect git diff for intended scope**

Run:
```bash
git diff -- src/renderer/assets src/renderer/assets/__tests__ build docs/assets/logo.png
```

Expected: Only icon assets, generated outputs, and related tests changed for this work.

- [ ] **Step 3: Summarize result**

Expected summary points:
- Approved icon direction implemented
- Generated assets refreshed
- Targeted tests passing
