# Terminal Lifecycle Ownership

## Evidence and Scope

The previous hibernation input-gate fix is installed. A read-only audit reproduced
two additional races in the shared `useXterm` hook:

- Activating a hidden surface while its output-suspension request is pending
  starts restoration before disposal. Restoration resets the existing binding,
  then returns with no backend session, leaving input unusable.
- A superseded creation request can bind its late result and clear the newer
  binding. Both Codex and Claude lose input after the replacement was usable.

Keep this repair within the renderer lifecycle and its regression tests. Preserve
initial attach, first-output startup acceleration, transcript replay, reconnect,
remote paths, and existing persistent Agent processes. Do not send the unknown
input buffered by an earlier production renderer.

## Decision

Commit hibernation only after output suspension completes and the same hidden,
inactive, unselected surface and session are still current. Keep the restoration
snapshot local until that transition commits. A quick activation cancels the
transition and resumes output without detaching or recreating the backend.

Use the existing initialization generation and terminal identity as the owner
check. Validate them after detach, runtime lookup, creation, attach, and before
error cleanup or fallback. An obsolete attempt must not change current refs,
subscriptions, loading state, or input queues. It may clean up only a session it
created that is not currently bound: kill an ephemeral session, but detach a
persistent session to preserve its host. Never kill an existing recovered session
because an obsolete attach completed.

## Alternatives

- Disable hibernation: avoids one race but keeps idle renderer resources and does
  not address stale initialization. Rejected.
- Guard transition commits and cleanup with existing ownership identifiers:
  focused change that preserves the current architecture. Chosen.
- Replace the session lifecycle wholesale: larger cross-process blast radius
  than required by these demonstrated failures. Rejected.

## Verification

Convert the audit reproductions into durable failing tests, then cover late
success and rejection at adjacent async boundaries. Parameterize the principal
races for Codex and Claude. Check queued input, continued immediate input,
replacement output/state subscriptions, and preservation of persistent hosts.
Run focused tests, type checking, lint, and the full suite. Validate actual
keyboard input against an isolated built and packaged Electron instance before
updating the local application with a recoverable backup.
