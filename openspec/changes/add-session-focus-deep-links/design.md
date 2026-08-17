## Context

The main process owns the Infilux URL scheme, pending path handling, open-url events, and second-instance forwarding. The renderer owns worktree switching and agent-session selection.

## Goals / Non-Goals

**Goals:** parse one explicit focus payload, preserve path links, and deliver it once after renderer readiness.

**Non-Goals:** public remote-control APIs, cross-profile session access, or automatic session creation.

## Decisions

Introduce a serializable `SessionFocusRequest` shared type and a dedicated app push event. The main process validates URL syntax and queues the request beside pending path state. The renderer validates repository, worktree, and session ownership before focus.

Encoding focus state in a path string is rejected because it conflates filesystem navigation with agent-session identity and weakens backward compatibility.

## Risks / Trade-offs

- Early URL arrival → retain one pending request until renderer readiness.
- Duplicate delivery → deduplicate by normalized request token.
- Stale identifiers → no-op with recoverable diagnostics.

## Migration Plan

Retain `infilux://?path=` unchanged; add documented session parameters; roll back by ignoring the new parameters while continuing path handling.
