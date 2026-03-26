# Infilux Repo Slug Migration Preparation

> **Status**: Draft  
> **Date**: 2026-03-25  
> **Goal**: Prepare and complete the codebase migration from the legacy GitHub repository slug `J3n5en/EnsoAI` to `funenc-lab/infilux`.

---

## 1. Current State

The product brand has already been renamed to **Infilux**, but the external release pipeline still depends on the legacy repository slug:

- GitHub Releases: `J3n5en/EnsoAI`
- Raw userscript delivery: `raw.githubusercontent.com/J3n5en/EnsoAI/...`
- Electron auto-publish target: `owner: J3n5en`, `repo: EnsoAI`
- README package channels still reference `ensoai` identifiers

This previously created two classes of identifiers:

1. **Brand identifiers** — already moved to `Infilux`
2. **Distribution identifiers** — still partially tied to `EnsoAI`

The purpose of this document is to record the migration surface and the remaining follow-up work after the repository URL update.

---

## 2. Preparation Completed In This Phase

### 2.1 Centralized legacy repository constants

Repository-facing code paths are centralized in:

- `src/shared/branding.ts`

This consolidates the repository migration surface for:

- Repository URL
- Releases URL base
- Raw userscript URL

### 2.2 Remaining migration surface inventory

The remaining migration points are now clearly separated into:

- **Code constants** — now switched to `funenc-lab/infilux`
- **Build config** — now switched to `funenc-lab/infilux`
- **Documentation and package channels** — still depend on legacy identifiers outside the app runtime

---

## 3. Remaining Migration Surface

### 3.1 Build and release pipeline

- `electron-builder.yml`
  - `publish.owner`
  - `publish.repo`
- Release assets referenced by `RemoteRuntimeAssets`
- Any CI workflow that uploads GitHub releases or draft assets

### 3.2 Documentation and package manager channels

- `README.md`
- `README.zh.md`
- Homebrew tap naming
- Scoop bucket naming
- Product Hunt link
- Telegram links

### 3.3 External integration URLs

- GitHub repository links shown in app UI
- Web Inspector userscript raw URL

---

## 4. Recommended Migration Order

1. **Create the target GitHub repository slug**
2. **Mirror or transfer release assets**
3. **Update CI/release publishing workflow**
4. **Switch `electron-builder.yml` publish target**
5. **Switch shared constants in `src/shared/branding.ts`**
6. **Update README package channels and external community links**
7. **Run full validation**

This order minimizes the chance of shipping an app that points to missing assets.

---

## 5. Validation Checklist For The Actual Migration

- [ ] GitHub Releases page exists under the new slug
- [ ] Release asset download URLs return `200`
- [ ] Web Inspector userscript raw URL returns `200`
- [ ] `electron-builder.yml` publish target matches the new slug
- [ ] In-app GitHub links open the new repository
- [ ] `pnpm lint` passes
- [ ] `pnpm typecheck` passes
- [ ] `pnpm build` passes
- [ ] Auto-update flow is smoke-tested against the new release source

---

## 6. Rollback Strategy

If the migration fails after public release:

1. Restore `electron-builder.yml` to the legacy slug
2. Repoint `src/shared/branding.ts` legacy URL constants back to `J3n5en/EnsoAI`
3. Re-publish documentation notes explaining temporary rollback

Because runtime URLs are centralized now, rollback is low-risk and localized.
