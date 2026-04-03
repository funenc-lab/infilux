# APP SERVICES TESTS GUIDE

This directory contains tests for app detection, path validation, and recent-project service behavior.

This guide extends `src/main/services/app/AGENTS.md`.

## RESPONSIBILITIES

- Verify development-safe path handling, app discovery shaping, and recent-project normalization
- Cover packaged-runtime branches through fixtures or synthetic metadata instead of real installed apps
- Keep path-policy and environment-detection behavior explicit and reproducible

## RULES

- Use temporary directories, synthetic bundle metadata, and mocked process output for app discovery tests.
- Do not rely on a real installed `Infilux.app`, `/Applications`, or user production config directories.
- Assert normalized path and capability results rather than machine-specific raw output.
- Keep development-mode and packaged-runtime behavior covered as separate scenarios when both matter.

## ANTI-PATTERNS

- Touching real installed app bundles during tests
- Depending on the current machine's app inventory
- Mixing recent-project persistence assertions with renderer presentation behavior
