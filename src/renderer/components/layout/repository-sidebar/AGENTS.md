# REPOSITORY SIDEBAR GUIDE

This directory contains leaf components for repository rows and summaries inside the repository sidebar.

This guide extends `src/renderer/components/layout/AGENTS.md`.

## RESPONSIBILITIES

- Render repository-specific sidebar row content
- Keep repository sidebar item presentation modular and testable

## RULES

- Item components should stay narrowly focused on sidebar rendering concerns.
- Repository identity, status, and summary display should remain explicit and scannable.
- Shared selection or snapshot policies belong in the parent layout directory, not here.

## ANTI-PATTERNS

- Embedding repository-sidebar orchestration into leaf row components
- Recomputing repository models independently in each item
