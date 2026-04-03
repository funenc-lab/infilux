# AGENT SERVICES TESTS GUIDE

This directory contains tests for agent registry, subagent tracking, and transcript-related services.

This guide extends `src/main/services/agent/AGENTS.md`.

## RESPONSIBILITIES

- Verify agent identity, state transitions, and timestamped tracking behavior
- Cover transcript ordering, grouping, and persistence-facing behavior
- Keep agent concerns separate from PTY or session transport expectations

## RULES

- Prefer explicit event sequences over broad snapshots of registry state.
- Assert ordering and relationship integrity for subagent and transcript flows.
- Use deterministic clocks or injected timestamps when sequencing matters.

## ANTI-PATTERNS

- Treating PTY transport behavior as agent-service coverage
- Hiding ordering assumptions in opaque fixture blobs
- Using nondeterministic time-based assertions
