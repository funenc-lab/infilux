# MAIN SERVICES GUIDE

This directory contains long-lived main-process services and domain orchestration code.

This guide extends `src/main/AGENTS.md` and the root `AGENTS.md`.

## RESPONSIBILITIES

- Own domain logic behind IPC and lifecycle entry points
- Encapsulate privileged system access, child-process control, and resource cleanup
- Keep domain state explicit and testable
- Separate runtime coordination by subsystem instead of building a single service god object

## DIRECTORY SHAPE

- Keep each domain under its own folder when the logic has state, lifecycle, or multiple collaborators.
- Shared service utilities that span several domains should remain minimal and clearly named.
- Cross-domain coordination should happen through explicit imports and narrow interfaces, not hidden globals.

## EXTENSION POINTS

- Add a new domain folder when a capability has its own lifecycle, external dependencies, or persistence needs.
- Add focused pure helpers inside a domain before creating new shared abstractions.
- Promote duplicated patterns only after at least two domains need the same abstraction.

## ANTI-PATTERNS

- Mixing session, PTY, remote, and agent concerns into the same class
- Hiding global mutable state behind top-level module variables without documenting ownership
- Letting service methods return renderer-shaped data instead of domain contracts
- Creating cross-domain backchannels instead of explicit dependencies
