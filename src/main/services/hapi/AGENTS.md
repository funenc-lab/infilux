# HAPI SERVICES GUIDE

This directory owns Hapi-related runtime managers such as server startup, runner coordination, and tunnel support.

This guide extends `src/main/services/AGENTS.md`.

## RESPONSIBILITIES

- Start and stop Hapi runtime processes predictably
- Coordinate cloudflared or related support services
- Keep Hapi-specific lifecycle concerns isolated from generic agent services

## RULES

- Startup dependencies and shutdown ordering must remain explicit.
- Process health, ports, and tunnel state should be observable.
- Keep Hapi-specific process management separate from generic CLI detection or PTY transport.

## ANTI-PATTERNS

- Treating Hapi background processes as unmanaged helpers
- Mixing Hapi runtime policy into unrelated agent or session services
