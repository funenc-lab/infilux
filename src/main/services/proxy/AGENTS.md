# PROXY SERVICES GUIDE

This directory owns proxy-related configuration and normalization for main-process integrations.

This guide extends `src/main/services/AGENTS.md`.

## RESPONSIBILITIES

- Normalize proxy settings into runtime-ready configuration
- Keep network proxy rules consistent across consumers

## RULES

- Prefer explicit configuration shapes over loosely typed option bags.
- Keep environment-variable mapping and normalization close to this directory.
- Avoid leaking proxy policy decisions into unrelated network clients.

## ANTI-PATTERNS

- Recomputing proxy normalization in each caller
- Mixing UI defaults or settings copy into proxy helpers
