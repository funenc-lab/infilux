## 1. Windows Backend Contract

- [ ] 1.1 Add failing unit tests for Windows build detection, ConPTY selection, WinPTY fallback, and serializable backend diagnostics in `src/main/services/terminal/__tests__/WindowsPtyHelper.test.ts`.
- [ ] 1.2 Add shared Windows PTY backend and diagnostic types in `src/shared/types/terminal.ts` and verify type exports with focused shared tests.

## 2. Helper Transport

- [ ] 2.1 Add failing protocol tests for create, data, resize, exit, error, cancellation, and malformed helper messages in `src/main/services/terminal/__tests__/ptyHelperProtocol.test.ts`.
- [ ] 2.2 Create `ptyHelperProtocol.ts` and a forked `ptyHelper.ts` runtime with explicit command and event validation.
- [ ] 2.3 Implement `WindowsPtyHelper.ts` with create and destroy timeouts, ordered pre-activation output buffering, one-shot exit delivery, and process-tree cleanup.

## 3. Terminal Integration and Packaging

- [ ] 3.1 Extend `PtyManager.test.ts` with Windows helper selection, fallback, repeated destroy, and non-Windows regression cases.
- [ ] 3.2 Integrate the helper in `PtyManager.ts` without moving session persistence or renderer transport logic into the helper.
- [ ] 3.3 Add packaged-runtime tests for helper resolution and asar-unpacked assets in `src/main/services/terminal/__tests__/ptyHelperPackaging.test.ts`.

## 4. Verification

- [ ] 4.1 Run focused terminal tests on supported platform fixtures and record helper timeout and cleanup evidence.
- [ ] 4.2 Run `pnpm typecheck`, `pnpm lint`, relevant terminal E2E coverage, and `openspec validate harden-windows-pty-runtime --strict` before committing.
