# WINDOW SERVICES GUIDE

This directory owns Electron window creation, configuration, and higher-level window management.

This guide extends `src/main/AGENTS.md`.

## RESPONSIBILITIES

- Build the main BrowserWindow configuration
- Coordinate window creation, lookup, and lifecycle management
- Keep window-specific behavior separate from global app bootstrap

## RULES

- Window defaults should be explicit and stable.
- Keep webContents-related lifecycle hooks close to the window layer.
- Do not let unrelated domain logic accumulate in window managers.

## ANTI-PATTERNS

- Reaching into renderer feature state from window classes
- Hiding critical BrowserWindow options behind scattered helper calls
- Duplicating app bootstrap behavior that belongs in `src/main/index.ts`
