# FILE COMPONENTS GUIDE

This directory owns file browsing, Monaco editing, previews, file dialogs, and editor-side policies.

This guide extends `src/renderer/components/AGENTS.md`.

## RESPONSIBILITIES

- Render file tree, editor tabs, Monaco, previews, and file workflow dialogs
- Keep editor-related policies and helper models close to file UI
- Coordinate with editor, navigation, settings, and terminal-write stores

## RULES

- Preserve worktree-aware restoration, dirty-file prompts, and external-change handling.
- Treat local and remote file paths as first-class.
- Extract editor policies into focused helpers when behavior is reused or branch-heavy.
- Keep Monaco setup, preview policy, reload policy, and selection cache explicit and testable.

## HOTSPOTS

- `EditorArea.tsx`
- `FileTree.tsx`
- `FilePanel.tsx`
- `CurrentFilePanel.tsx`

## ANTI-PATTERNS

- Duplicating file-open or tab-close logic across panels
- Assuming preview and editor modes share identical lifecycle behavior
- Letting Monaco-specific side effects leak into generic UI primitives
