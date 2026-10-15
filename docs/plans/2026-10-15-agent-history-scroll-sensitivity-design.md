# Agent History Scroll Sensitivity

## Approved Scope

Normalize app-owned agent history scrolling consistently across wheel event sizes, accumulate compatibility paging against the visible terminal height, and emit at most one compatibility page per event. Preserve native agent mouse handling, tmux input protection, session recovery, and the existing input-delivery fix.

## Evidence

With a 20 CSS-pixel cell height, the existing policy turns 500 pixels into 7 lines when delivered as fifty 10-pixel events, but 25 lines when delivered as ten 50-pixel events. The same inputs produce zero versus three compatibility page keys. A per-event 50-pixel threshold switches the pixel multiplier from 0.3 to 1, while compatibility paging treats eight lines as a page regardless of terminal height.

## Decision

- Apply the existing gentle pixel multiplier, 0.3, to every app-owned pixel delta. Keep signed fractional carry so small events are not lost. Browser line units keep their existing scale.
- Pass the terminal's current visible row count into both the primary wheel policy and the tmux alternate-screen compatibility fallback. Use 24 rows only when no valid row count is available.
- Use the visible row count for browser page units and compatibility page accumulation. Send at most one Page Up or Page Down per event and discard whole-page excess, preserving only a sub-page remainder.
- Normalize near-integer line sums to prevent floating-point accumulation from missing exact page boundaries. Reduce prior program carry to a sub-page remainder before adding a new delta, so a smaller viewport cannot replay an old whole-page budget on a reversed gesture.
- Leave native mouse-tracking delegation unchanged. No new scroll owner, timers, settings, IPC channels, or backend changes are needed.

## Alternatives

A global sensitivity reduction also slows native programs and ordinary terminals without removing the event-size discontinuity. Replacing native mouse reports with synthetic page keys would break program-owned history and pointer semantics. The selected change stays in the existing app-owned policy.

## Verification

Use policy regressions for event segmentation, the former 50-pixel boundary, display scale, fractional carry, viewport-sized paging, direction reversal, and large-event page limits. Exercise the real policy through the hook for direct, local tmux, and remote tmux sessions. Use an isolated Electron fixture to compare actual local and tmux history movement, and rerun native scrolling and input recovery scenarios. Do not replace or restart the installed app or commit changes without a separate request.
