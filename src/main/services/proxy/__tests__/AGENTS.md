# PROXY SERVICES TESTS GUIDE

This directory contains tests for proxy configuration and normalization helpers.

This guide extends `src/main/services/proxy/AGENTS.md`.

## RESPONSIBILITIES

- Verify explicit proxy normalization behavior and environment mapping
- Keep configuration coverage deterministic and platform-safe

## RULES

- Use explicit input matrices for proxy settings and expected normalized output.
- Prefer pure assertions over environment-dependent behavior.

## ANTI-PATTERNS

- Depending on the developer machine's proxy environment
- Treating UI defaults as proxy-service behavior
