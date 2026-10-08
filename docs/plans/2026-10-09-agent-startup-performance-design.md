# Agent Startup and Input Performance

## Approved Scope

Measure the complete startup path and keyboard responsiveness before changing
behavior. Preserve production sessions and do not submit messages to real
providers. Use isolated Electron profiles and fixture-owned PTYs for comparison.

## Current Evidence

The existing Agent startup timeline begins inside `useXterm`, after
`AgentTerminal` has resolved its shell, optional Hapi installation, Claude IDE
readiness, and workspace trust. It does not mark input-channel availability or
surface readiness. The 2026-10-09 diagnostics snapshot and native sample are in
`.tmp/diagnostics/2026-10-09-agent-performance-baseline` in the primary workspace.
They do not establish the cause of the earlier multi-minute first launch.

Visible terminal output currently waits for a 30 ms batch timer even when it is
the direct response to keyboard input. Measure this path with an echoing fixture
before deciding whether to expedite the first response. Keep ordinary streaming
output batched and preserve write ordering, backpressure, and lifecycle guards.

## Design

- Reuse the existing startup logger and IPC bridge. Share one renderer timeline
  from Agent prerequisites through terminal initialization, input availability,
  and surface readiness. Log fixed stage names only, not input or transcripts.
- Keep instrumentation passive: it must not restart sessions, change launch
  readiness gates, bypass trust, or retry unresolved history automatically.
- Extend the existing isolated wheel-probe fixture with opt-in echo and UTF-8
  text handling. Capture keyboard-to-parsed-echo durations in the renderer and
  report bounded samples and descriptive statistics without machine-wide claims.
- If the baseline confirms an avoidable interactive batch wait, expedite only
  the next visible response after user input. Retain the existing batching path
  for autonomous agent output and outstanding writes.
- Exercise initial use, repeated hidden-surface restoration, Unicode text,
  interrupted initialization, and ordinary output batching. Native operating
  system IME candidate-window behavior is a separate manual acceptance item.

## Non-Goals

Do not reconfigure Codex storage, trust, provider credentials, or daemons. Do not
publish, replace the installed production app, or restart its live sessions in
this round. Do not equate fixture startup with a real provider's network startup.

## Verification

Use TDD for new instrumentation and scheduling behavior. Compare the same
isolated echo scenario against the previously verified package and the new build.
Run focused tests, typecheck, formatting/theme/test-quality checks, and Electron
regressions. Record sample counts, actual values, and outstanding verification
items; do not claim a complete production performance audit from these samples.
