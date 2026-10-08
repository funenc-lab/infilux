# Codex tmux-backed conversation scrolling

## Goal

Let the wheel scroll the active Codex conversation when its full-screen UI runs in a persistent tmux session. Preserve tmux history scrolling in the normal terminal buffer and preserve existing behavior for Claude, other agents, and ordinary terminals.

## Cause

The renderer's wheel policy gives tmux host scrolling precedence over full-screen program scrolling for Codex. A Codex pane uses the alternate terminal buffer, so tmux copy mode does not navigate Codex's application-owned conversation history. Claude already has a provider-specific alternate-buffer exception.

## Decision

Extend the existing provider-aware alternate-buffer exception to Codex, including supported provider suffixes resolved through `getAgentInputBaseId`. Once a wheel delta is normalized, route Codex's alternate-buffer wheel events to the established Page Up / Page Down program-scroll path before considering tmux host scrolling. Keep the current delta accumulation, repeat cap, zero-delta behavior, and invalid-dimension fallback.

The normal buffer must continue using tmux host scrolling when a tmux host is present. Other providers retain their existing mouse-tracking and tmux handling; ordinary terminals are not intercepted. This change stays in the pure renderer policy and does not alter the tmux service, session persistence, CLI state, or saved transcripts.

## Alternatives

- Route every tmux-backed agent through program scrolling: simpler branching but breaks normal-buffer scrollback and other programs.
- Increase or reconfigure tmux scrollback: does not make tmux copy mode navigate an alternate-screen application's own history.
- Scope the existing alternate-buffer exception to Codex as well as Claude: fixes the incorrect routing without changing unrelated terminal behavior. Chosen.

## Verification

Add a failing policy regression for Codex in an alternate buffer under tmux, covering upward and downward wheel input and provider suffixes; assert Codex's normal buffer still uses tmux. Exercise the hook's existing program-scroll dispatch with a tmux-backed Codex session, asserting it writes Page Up instead of calling the tmux scrolling bridge. Run focused tests, typecheck, lint, and the project test suite. Do not interrupt existing live tmux sessions for verification; new renderer code requires a rebuilt or relaunched app to affect the installed application.
