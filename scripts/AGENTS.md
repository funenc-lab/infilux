# SCRIPTS GUIDE

This directory owns project automation, diagnostics, release helpers, and quality checks.

This guide extends the root `AGENTS.md`.

## RESPONSIBILITIES

- Provide repeatable local and CI commands for build, diagnostics, release, and repository quality gates
- Keep automation behavior testable and independent from renderer or main-process runtime state
- Centralize workflow logic that would otherwise become brittle inline shell in `.github/workflows/`

## RULES

- Prefer typed TypeScript or focused `.mjs` modules for non-trivial automation.
- Keep command-line arguments explicit and validate required inputs before performing work.
- Avoid destructive file-system operations unless they are narrowly scoped, documented, and guarded.
- Keep generated assets deterministic so build and release diffs are reviewable.
- Use repository-relative paths from an explicit project root instead of hidden current-directory assumptions.
- Keep stdout suitable for humans and CI logs; put actionable failures on stderr and exit non-zero.

## EXTENSION POINTS

- Add reusable logic as exported functions when a script needs unit coverage.
- Add tests under `scripts/__tests__/` for workflow compatibility, release metadata, diagnostics, and quality checks.
- Add dedicated release helpers under `scripts/release/` when behavior is specific to packaging or publication.

## TESTING FOCUS

- Cover argument parsing, error handling, generated metadata, and workflow compatibility.
- Prefer unit tests around pure script functions before adding integration-style command execution.
- Validate scripts that inspect source text carefully so they do not produce noisy false positives.

## ANTI-PATTERNS

- Relying on globally installed tools when the repository already provides a package script
- Hardcoding machine-specific paths, local app bundles, or personal configuration directories
- Mixing build output generation with unrelated cleanup or mutation
- Letting CI-only behavior diverge from locally runnable scripts
