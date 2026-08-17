## 1. CLI Contract Verification

- [ ] 1.1 Record the supported Pi and OMP executable names, version output formats, launch arguments, completion signals, recovery behavior, and supported platforms in the change design notes before implementation.
- [ ] 1.2 Add failing CLI detector fixtures for installed, missing, unsupported-version, custom-path, Windows-path, and remote-context cases in `src/main/services/cli/__tests__/BuiltinAgents.test.ts`.

## 2. Shared Catalog and Detection

- [ ] 2.1 Extend `src/shared/types/agentCatalog.ts` with Pi and OMP catalog entries, capability profiles, runtime policies, and conservative completion signals.
- [ ] 2.2 Extend `CliDetector.ts`, installation guidance, and focused tests so unavailable commands remain unavailable and supported commands report their detected version.
- [ ] 2.3 Add failing session launch and recovery tests for both built-ins without changing existing custom-agent behavior.

## 3. Settings and Runtime Integration

- [ ] 3.1 Extend agent settings and selection tests so catalog metadata drives names, availability, capability descriptions, and disabled states without provider-specific UI branches.
- [ ] 3.2 Integrate Pi and OMP launch behavior through the existing catalog-driven session path and preserve custom agent fallback.
- [ ] 3.3 Add remote and unsupported-runtime guard tests so the app never launches an unverified agent contract.

## 4. Verification

- [ ] 4.1 Run focused catalog, CLI, settings, session-launch, and recovery tests using fixture executables only.
- [ ] 4.2 Run `pnpm typecheck`, `pnpm lint`, and `openspec validate extend-built-in-agent-catalog --strict` before committing.
