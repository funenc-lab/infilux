# Terminal Input After Hibernation

## Evidence

The installed renderer and the current build are byte-identical. The affected
local Agent session has a live PTY and receives keyboard events in xterm's helper
textarea. Its renderer still reports session creation pending, with 74 queued
characters, while its runtime state is live and its input subscription exists.

`useXterm` marks input pending when constructing an xterm surface. The hibernated
surface restoration branch keeps the existing backend session but returns
without releasing that pending state. Subsequent input remains queued forever.
The shared hook affects Codex, Claude, and ordinary terminals after hibernation.

## Decision

Keep input buffered while a hibernated surface restores its replay. Once the
current surface has resumed output delivery, release the pending state and drain
the buffer through the same helper used by initial attach and reconnect. Only
send input to the currently bound live session. Preserve queued input while a
session is reconnecting, and never drain from an unmounted or superseded restore.

This stays within `src/renderer/hooks/useXterm.ts` and its existing tests. It does
not change session identity, IPC contracts, tmux configuration, provider logic,
or persistence. Do not manually release the affected production session's
unknown 74-character queue, which may contain submission keys.

## Alternatives

- Release pending input when a new surface is constructed: smaller change, but
  input can run ahead of replay restoration and output delivery.
- Release and drain after successful restoration: preserve existing input
  buffering and reuse the initial-attach/reconnect behavior. Chosen.
- Replace the complete session lifecycle with a new state machine: unnecessary
  blast radius for this demonstrated missing transition.

## Verification

First reproduce the failure in the existing hibernation hook harness. Verify
input typed during replay is delivered once, input typed after restoration is
sent immediately, reconnecting sessions retain their queue until live, and a
cancelled restoration does not write to an obsolete session. Retain existing
startup, replay, recovery, and composition tests. Run focused tests, typecheck,
lint, and the full suite, then validate the built Electron app with isolated
runtime state before replacing the production application.
