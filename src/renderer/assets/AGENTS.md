# RENDERER ASSETS GUIDE

This directory contains static renderer assets such as logos and other shipped image resources.

This guide extends `src/renderer/AGENTS.md`.

## RESPONSIBILITIES

- Store stable static assets referenced by renderer code
- Keep asset naming and variant usage predictable

## RULES

- Prefer descriptive, durable filenames.
- Replace assets deliberately and confirm all consumers still reference the intended variant.
- Keep generated or source-of-truth notes close to the asset when necessary.

## ANTI-PATTERNS

- Treating this directory as a generic scratch space
- Introducing near-duplicate asset variants without a clear usage boundary
