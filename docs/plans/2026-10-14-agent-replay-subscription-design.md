# Agent Replay Subscription Design

## Approved Goal

Prevent one retained replay update from rendering the entire AgentPanel and its
unrelated mounted terminals. Preserve input, recovery, history fallback, session
membership, worktree behavior, and existing persistence cadence.

## Architecture

The agentSessions store remains the owner of persisted sessions. A memoized
metadata selector projects all Session fields except replaySnapshot and
replaySnapshotCapturedAt. Equal metadata and its array retain their references.
AgentPanel consumes this projection instead of the full sessions array.

Small panel-only adapters subscribe to replay for a single session ID and pass it
to the existing AgentTerminal and AgentSessionTranscriptDrawer. Terminal adapters
select text only. The open transcript adapter selects text and capture time,
preserving the drawer's private live-snapshot precedence over retained history.
Closed drawers do not select session replay. No new durable state is introduced.

## Alternatives

Memoizing terminal components alone would leave parent layout and callback
calculation active. Increasing the replay commit interval would reduce history
freshness without removing the subscription coupling. Neither is included.

## Lifecycle And Errors

Existing transport, cleanup, replay commit timers, and terminal mount policies are
unchanged. Zustand hook cleanup owns the new leaf subscriptions. Removed sessions
must not retain their replay through a metadata cache. Restored and newly mounted
terminal adapters read the current retained replay, not an earlier panel prop.

## Verification

Use real-store React tests for tab, worktree-canvas, and workspace-canvas layouts.
Assert that a replay commit renders only its target terminal and does not render
the parent panel. Cover timestamp-only changes, metadata updates, removal,
deferred mount freshness, and drawer fallback before live snapshots exist.
Keep the existing recovery, focus, split, merge, and transcript tests passing.
Run targeted regression suites, full lint, typecheck, and diff checks.

## Scope

The user approved this subscription split on 2026-10-14. Implementation continues
in the existing dirty workspace so the current uncommitted fixes stay in scope.
Do not stage, commit, push, reinstall, restart the app, or change active sessions.
Installed-app frame-time validation remains a separate step.
