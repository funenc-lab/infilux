# WORKTREE COMPONENTS GUIDE

This directory owns worktree creation, merge-editor entry points, and worktree-focused renderer surfaces.

This guide extends `src/renderer/components/AGENTS.md`.

## RESPONSIBILITIES

- Render worktree-specific dialogs, cards, lists, and merge-related UI
- Keep worktree workflows separate from generic repository administration

## RULES

- Worktree path, branch, and merge context should remain explicit in the UI.
- Preserve destructive-action clarity when deleting or merging worktrees.
- Keep worktree-specific components aligned with worktree store ownership and app-shell selection flow.

## ANTI-PATTERNS

- Hiding branch or path context in worktree actions
- Mixing worktree management behavior into generic sidebar layout code
