# SEARCH SERVICES GUIDE

This directory owns privileged search execution and result shaping for repository or workspace search features.

This guide extends `src/main/services/AGENTS.md`.

## RESPONSIBILITIES

- Execute search operations safely and efficiently
- Normalize search results into stable domain payloads

## RULES

- Search behavior should stay explicit about scope, limits, and encoding.
- Keep command execution or search backend details encapsulated here.
- Return structured matches instead of raw tool output when possible.

## ANTI-PATTERNS

- Pushing raw grep-like output into renderer consumers
- Mixing panel-specific filtering logic into search services
