# AI SERVICE GUIDE

This directory contains focused AI-assisted generators and review helpers such as branch naming, commit messages, and code review support.

This guide extends `src/main/services/AGENTS.md`.

## RESPONSIBILITIES

- Build structured prompts or input payloads for AI-assisted workflows
- Normalize AI outputs into deterministic application-level results
- Keep feature-specific AI behavior isolated from unrelated service domains

## RULES

- Favor pure transformations and explicit inputs over hidden ambient state.
- Return structured results that calling code can validate and render.
- Keep provider-specific behavior behind stable helper boundaries.
- Do not mix repository IO, IPC registration, or settings persistence into these helpers.

## ANTI-PATTERNS

- Returning raw model output without normalization
- Hardcoding renderer phrasing or dialog behavior into AI helpers
- Coupling prompt construction to one caller when the behavior is shared
