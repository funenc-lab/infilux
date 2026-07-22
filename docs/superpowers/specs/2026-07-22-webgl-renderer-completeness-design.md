# WebGL Renderer Completeness Design

## Goal

Make the configured WebGL renderer effective for shell and agent terminals while preserving reliable DOM fallback after an explicit compatibility request or WebGL failure.

## Scope

- Keep one platform-aware terminal font-family resolver for initial construction and dynamic updates.
- Include the resolved runtime font family in WebGL visual cache invalidation.
- Let agent terminals honor the configured renderer by default in every layout mode.
- Dispose a WebGL addon immediately when activation fails.
- Add focused regression coverage for each production behavior.

## Design

### Runtime font options

`xtermTerminalOptions` owns platform-aware font-family resolution. The resolver becomes a public pure helper so `useXterm` can derive the same runtime value used by terminal construction. The terminal settings stored by Zustand remain unchanged; only xterm receives the expanded fallback chain.

The resolved font family is used for:

- initial `Terminal` options;
- dynamic `terminal.options.fontFamily` updates;
- the WebGL visual signature that controls texture-atlas invalidation.

### Renderer selection

`AgentTerminal` defaults `preferCompatibilityRenderer` to `false`. `AgentPanel` no longer derives a compatibility override from canvas layout or mounted terminal count. The explicit compatibility option remains available for callers that intentionally require DOM, and WebGL context-loss handling continues to fall back to DOM.

### Failure cleanup

`useXterm.loadRenderer` retains the newly created addon in a local variable across the activation attempt. If `terminal.loadAddon` throws, the catch path disposes that addon before clearing renderer state and continuing with DOM fallback.

## Test Plan

| Code change | Test behavior | Test file |
| --- | --- | --- |
| Reuse resolved runtime font family | Dynamic font-size update preserves CJK fallbacks in final terminal options | `src/renderer/hooks/__tests__/useXterm.test.ts` |
| Honor configured renderer for agents | Agent terminal passes compatibility preference `false` by default | `src/renderer/components/chat/__tests__/AgentTerminal.integration.test.ts` |
| Remove canvas-count compatibility override | Agent panel source and policy tests no longer encode forced DOM behavior | Existing chat tests and type checking |
| Dispose failed WebGL activation | Failed `loadAddon` disposes the created addon and leaves fallback active | `src/renderer/hooks/__tests__/useXterm.test.ts` |

## Error Handling

WebGL constructor or activation failures remain non-fatal. The terminal logs the existing warning, disposes any partially loaded addon, and uses xterm's default DOM renderer. Context loss remains a one-way fallback for the active addon until an explicit renderer switch creates a new instance.

## Non-Goals

- Replacing xterm.js rendering internals.
- Persisting expanded font fallback strings in user settings.
- Adding another renderer state store or renderer implementation.
