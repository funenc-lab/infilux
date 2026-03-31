# REMOTE SERVICES GUIDE

This directory owns remote connection lifecycle, auth prompting, runtime asset preparation, remote paths, and remote repository access.

This guide extends `src/main/services/AGENTS.md`.

## RESPONSIBILITIES

- Manage remote connection state, reconnection, and diagnostics
- Coordinate helper/runtime installation and verification
- Bridge remote filesystem, session, and repository capabilities to the rest of the app

## RULES

- Treat connection state transitions as architecture-sensitive.
- Keep auth prompting, helper sourcing, runtime verification, and RPC transport as separate responsibilities.
- Preserve host verification, reconnect behavior, and buffered diagnostic output.
- Keep local-path and remote-virtual-path handling consistent and explicit.

## HOTSPOTS

- `RemoteConnectionManager.ts`
- `RemoteHelperSource.ts`
- `RemoteRepositoryBackend.ts`

## ANTI-PATTERNS

- Treating remote mode as an edge case layered on top of local-only assumptions
- Mixing renderer presentation logic into connection or auth services
- Changing reconnect or shutdown behavior without verifying lifecycle cleanup
