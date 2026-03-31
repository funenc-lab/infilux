# RENDERER DATA GUIDE

This directory contains static data files consumed by renderer features.

This guide extends `src/renderer/AGENTS.md`.

## RESPONSIBILITIES

- Store stable data artifacts such as theme definitions or other shipped datasets
- Keep data files versioned and easy to trace to their consumers

## RULES

- Data here should be static, deterministic, and renderer-safe.
- Document regeneration or source-of-truth expectations when a dataset is derived.
- Prefer one file per clear dataset instead of mixing unrelated data together.

## ANTI-PATTERNS

- Treating static data as mutable runtime state
- Hiding generated-data provenance when updates require a build step
