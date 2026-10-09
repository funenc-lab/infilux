# Agent Input Reliability Design

## Approved Scope

The user approved executing the recommended input-failure and streaming-echo
repairs after the read-only follow-up. Continue in `perf/agent-startup-readiness`;
do not replace the installed app, merge, push, or send real provider messages.

## Evidence

- `SESSION_WRITE` currently resolves before remote/supervisor writes complete.
- Missing sessions and non-live remote sessions silently ignore writes.
- `useXterm` neither handles rejected writes nor provides visible failure feedback.
- Its one-shot response marker can be consumed by background output before echo.
- The existing fixture only measures quiet, parsed echo, not native IME or pixels.
- Diagnostics are captured at `.tmp/diagnostics/agent-input-followup`; automatic
  log-directory discovery failed, so no new production-log claim is made.

## Alternatives

1. Recommended: await transport acceptance, report failures without resending,
   and expedite a small bounded response burst. Keep existing batching/ordering.
2. Disable all output batching: potentially lower quiet latency, but substantially
   increases IPC/render load and changes multi-session backpressure behavior.
3. Locally echo characters or automatically resend: can duplicate provider input,
   diverge from TUI state, or execute a message twice. Rejected.

## Design

Add `SessionManager.writeInput` as the acknowledged input entry point. Keep the
legacy fire-and-forget `write` wrapper for compatibility. Await remote/supervisor
transport acceptance, reject missing/non-live sessions and missing local PTYs,
and preserve runtime-state notifications. Acceptance is not provider completion.
Existing preload `Promise<void>` contracts remain valid; IPC must await them.
Supervisor failures update their owned runtime state; successful attach or
subscription recovery restores that state and notifies attached windows, so
the new non-live gate cannot permanently disable input after recovery.
Successful supervisor recovery advances an input epoch, preventing late failures
from pre-recovery writes from marking the recovered runtime dead again.
Remote writes use the same recovery-epoch guard across create, reattach, and
connection-resume paths, so an old remote RPC rejection cannot regress a live
session after recovery.

The enhanced-input service serializes each session's text/delay/submit dispatch
transactions, awaits acceptance, and returns submission failures. Other sessions
remain independent; failed transactions are not retried and do not block later
queued requests. Ordinary keyboard input still belongs to the guarded xterm
writer, not this dispatch queue. No automatic retries are introduced. The hook
catches failures, reports one notification per failure episode, and ignores
obsolete/unmounted results. Successful newer writes permit a later notification.
Enhanced-input and attachment feedback, including activation on success, are
guarded by a component input epoch that changes on session switches and unmount.
Reuse the existing translated send-failure title without suggesting automatic
resend; a rejected transport acknowledgement cannot prove provider processing.
Shift+Enter uses the hook's existing guarded writer instead of bypassing it.

Extend renderer response acceleration to at most four small output events,
64Ki characters total, within 50ms of first output and 500ms of input. Preserve
buffer ordering, write serialization, visibility cleanup, and resync ownership.
Large/late/autonomous output remains normally batched. Main/supervisor 16ms
batching is deliberately unchanged until separately controlled measurements.
If excess output joins a pending accelerated flush, demote the shared ordered
batch to its ordinary deadline. Keep that deadline through busy/initial writers;
their completion must not bypass it. No output is reordered or discarded.
Final surface disposal clears the delay policy only immediately before its
ordered buffer drain, so an unmount cannot discard a demoted tail while normal
batching remains unchanged.

## Verification

Use failing tests before implementation for transport errors, deferred submits,
failure notification ownership, and background-then-echo acceleration. Exercise
fixture-owned Electron PTYs, English/Unicode input, hidden-surface restoration,
and streaming interference. Run typecheck, focused tests, lint, and a fresh build.
Native OS IME and real provider startup remain explicit manual acceptance gaps.
