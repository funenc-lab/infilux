# Infilux Branding And Repository Migration Summary

> **Status**: Completed (current phase)  
> **Date**: 2026-03-25  
> **Scope**: Brand rename, repository URL migration, build-warning cleanup, and validation summary

---

## 1. Summary

This phase completed the operational migration from the old EnsoAI-facing identity to **Infilux**.

The work covered four areas:

1. Product branding rename
2. App icon and logo refresh
3. Repository URL migration
4. Build and static verification cleanup

The codebase is now aligned to the following primary repository:

- **SSH**: `git@github.com:funenc-lab/infilux.git`
- **HTTPS**: `https://github.com/funenc-lab/infilux`

---

## 2. Completed Changes

### 2.1 Product brand rename

The application-facing name has been switched to **Infilux** across the main product surface:

- `package.json`
- `electron-builder.yml`
- `build/installer.nsh`
- `src/main/index.ts`
- `src/main/services/cli/CliInstaller.ts`
- `src/main/services/claude/ClaudeIdeBridge.ts`
- `src/renderer/index.html`
- `src/renderer/components/layout/WindowTitleBar.tsx`
- `src/renderer/components/layout/ActionPanel.tsx`
- `src/shared/i18n.ts`
- key documentation files under `README*` and `docs/`

### 2.2 Protocol and app identity

The following runtime identifiers were updated:

- URL scheme: `infilux://`
- App ID: `com.infilux.app`
- Product name: `Infilux`
- CLI command: `infilux`

### 2.3 Brand assets

A new Infilux visual identity was generated and applied:

- `build/icon.icns`
- `build/icon.ico`
- `build/icon.png`
- `build/icons/*`
- `src/renderer/assets/logo.png`
- `docs/assets/logo.png`

The icon system now uses a dark background with a loop / infinity-inspired symbol to match the Infilux naming direction.

### 2.4 Repository URL migration

Repository-facing references were migrated to `funenc-lab/infilux`.

Updated areas include:

- README release badges and release links
- README clone instructions
- Electron publish target in `electron-builder.yml`
- GitHub links shown in app UI
- Web Inspector script source URL
- Remote runtime release asset base URL

### 2.5 Repository constant centralization

Repository URLs are now centralized in:

- `src/shared/branding.ts`

This file now defines:

- repository owner
- repository name
- repository slug
- repository HTTPS URL
- repository SSH URL
- releases URL
- release download base URL
- Web Inspector userscript URL

This reduces future repository migration work to a small, explicit configuration surface.

### 2.6 Build warning cleanup

The previous main-process build warning:

- `Circular chunk: shell -> settings -> shell`

was removed by changing the Electron main-process build strategy to output a single bundle.

Current main build output:

- `out/main/index.js`

The fix was applied in:

- `electron.vite.config.ts`

with:

- `build.rollupOptions.output.inlineDynamicImports = true`

---

## 3. Verification Results

The following commands were executed after the migration changes:

```bash
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm build
```

### Results

- `pnpm lint` ✅ passed
- `pnpm typecheck` ✅ passed
- `pnpm build` ✅ passed

### Additional note

The main-process circular chunk warning no longer appears in the build output after the final build configuration adjustment.

---

## 4. Remaining Follow-up Items

The current migration phase is complete, but several external ecosystem identifiers may still need coordinated migration if desired:

- Homebrew tap naming
- Scoop bucket naming
- Telegram links
- Product Hunt URL
- Any external CI/release secrets or automation tied to previous repository ownership

These are no longer codebase blockers, but they remain operational follow-up tasks.

---

## 5. Recommended Next Step

The brand and repository migration work is now sufficiently isolated from product architecture work.

The recommended next implementation track is:

1. continue with editor refactor execution
2. keep branding/release-channel work as a separate operational stream

This avoids mixing repository migration risk with editor architecture changes.
