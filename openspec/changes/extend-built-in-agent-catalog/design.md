## Context

The shared agent catalog drives CLI detection, settings, launch defaults, and capability-aware routing. Custom agents remain intentionally supported for tools outside the catalog.

## Goals / Non-Goals

**Goals:** add verified Pi and OMP definitions through the shared catalog and make unavailable states explicit.

**Non-Goals:** inventing provider transcript support before CLIs prove it, replacing custom agents, or shipping an installer for unknown package managers.

## Decisions

Add catalog entries, CLI detector fixtures, and capability policies only after recording supported executable names, version parsing rules, launch arguments, completion signals, and recovery behavior. Use conservative marker completion where no provider lifecycle hook exists. Settings derives labels from catalog metadata rather than hardcoded provider-specific UI branches.

Treating every arbitrary command as a first-class built-in is rejected because it would make capability-aware execution and reliable recovery unverifiable.

## Risks / Trade-offs

- CLI contracts change upstream → gate availability by supported version parsing and preserve custom fallback.
- Completion behavior is uncertain → declare marker-only until an official lifecycle signal is validated.
- Platform-specific installation paths vary → reuse detector path normalization and test fixtures.

## Migration Plan

Add entries as unavailable-by-default until detection succeeds, preserve saved custom configurations, and remove a catalog entry without data migration if a CLI is withdrawn.
