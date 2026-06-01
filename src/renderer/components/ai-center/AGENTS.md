# AI CENTER COMPONENTS GUIDE

This directory owns the AI Center surface, decision-plan presentation, and local orchestration models.

This guide extends `src/renderer/components/AGENTS.md`.

## RESPONSIBILITIES

- Present cross-project AI task status, dispatch recommendations, intervention queues, and monitoring signals
- Convert todo execution summaries and enabled-agent data into user-visible decision plans
- Build prompts or session handoff payloads from explicit current repository and worktree context

## RULES

- Keep durable task, agent, and repository state in the existing stores and hooks that already own it.
- Keep orchestration models pure and testable; panel components should compose models, stores, and UI primitives.
- Preserve project and worktree identity in every dispatch, monitoring, and prompt-building path.
- Do not add persistence, IPC contracts, or filesystem access from this component folder.
- Keep recommendation copy concise and action-oriented; avoid explaining implementation mechanics in the UI.
- Preserve dense layout behavior with stable dimensions, truncation safety, and accessible status semantics.

## EXTENSION POINTS

- Add pure model helpers when new decision signals or risk calculations are reused across panel and tests.
- Add panel-level components when a section becomes independently testable or interactive.
- Route new execution actions through the existing todo or agent orchestration boundaries instead of local state.

## TESTING FOCUS

- Cover decision-plan generation for empty, ready, running, blocked, and mixed cross-project states.
- Test panel behavior through user-visible actions and labels rather than internal store shape.
- Verify prompt-building includes repository and worktree context without leaking unrelated project data.

## ANTI-PATTERNS

- Creating a second source of truth for todo execution state
- Triggering agent sessions without explicit repository or worktree context
- Embedding long business-rule conditionals directly in React render paths
- Letting hidden panel state drift from the underlying todo or agent stores
