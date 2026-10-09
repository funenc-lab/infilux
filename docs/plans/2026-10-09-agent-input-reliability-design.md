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

The enhanced-input service awaits text acceptance before delayed submit and
returns submission failures. No automatic retries are introduced. The hook
catches failures, reports one notification per failure episode, and ignores
obsolete/unmounted results. Successful newer writes permit a later notification.
Shift+Enter uses the hook's existing guarded writer instead of bypassing it.

Extend renderer response acceleration to at most four small output events,
64Ki characters total, within 50ms of first output and 500ms of input. Preserve
buffer ordering, write serialization, visibility cleanup, and resync ownership.
Large/late/autonomous output remains normally batched. Main/supervisor 16ms
batching is deliberately unchanged until separately controlled measurements.

## Verification

Use failing tests before implementation for transport errors, deferred submits,
failure notification ownership, and background-then-echo acceleration. Exercise
fixture-owned Electron PTYs, English/Unicode input, hidden-surface restoration,
and streaming interference. Run typecheck, focused tests, lint, and a fresh build.
Native OS IME and real provider startup remain explicit manual acceptance gaps.
