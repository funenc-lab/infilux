## 1. URL and IPC Contract

- [ ] 1.1 Add failing shared tests for normalized focus requests, duplicate tokens, and malformed parameters in `src/shared/types/__tests__/sessionFocus.test.ts`.
- [ ] 1.2 Add `SessionFocusRequest` types and a typed app push channel in `src/shared/types/` and `src/shared/types/ipc.ts`.

## 2. Main-Process Routing

- [ ] 2.1 Add failing `src/main/__tests__/index.test.ts` cases for cold start, macOS open-url, second-instance, valid focus URLs, stale URLs, and path-only compatibility.
- [ ] 2.2 Extend `src/main/index.ts` URL parsing and pending-action routing with one-time focus delivery and no regressions to existing path opening.
- [ ] 2.3 Extend preload bridge tests and `src/preload/index.ts` with the typed focus event and cleanup behavior.

## 3. Renderer Focus Behavior

- [ ] 3.1 Add failing App and session-store tests for same-repository focus, cross-worktree switch, stale session no-op, and remote-context mismatch.
- [ ] 3.2 Create a focused App hook that consumes the event, validates existing session ownership, switches worktree, and uses the current agent session store selection API.
- [ ] 3.3 Add Electron E2E coverage for a running-instance deep link and a cold-start deep link.

## 4. Verification

- [ ] 4.1 Run focused main, preload, renderer, and E2E deep-link tests on macOS plus platform-neutral argument fixtures.
- [ ] 4.2 Run `pnpm typecheck`, `pnpm lint`, and `openspec validate add-session-focus-deep-links --strict` before committing.
