# ELECTRON E2E GUIDE

This directory owns end-to-end scenarios that launch and exercise the Electron application.

This guide extends the root `AGENTS.md`.

## RESPONSIBILITIES

- Verify user-visible Electron workflows that cannot be covered reliably by unit or component tests
- Keep app launch, profile isolation, runtime channels, and process cleanup deterministic
- Capture regressions around session recovery, capability policy, and agent interaction behavior

## RULES

- Launch the app through shared helpers in `e2e/helpers/` instead of ad hoc Playwright setup.
- Isolate each scenario with temporary home directories, profiles, repositories, and runtime channels.
- Clean up Electron applications, child processes, temporary repositories, and session resources even on failure.
- Avoid depending on an installed production `Infilux.app`; tests should use the repository build output.
- Keep scenario helpers reusable and behavior-oriented rather than inspecting implementation details.
- Collect renderer and main-process console output when it materially improves failure diagnosis.

## EXTENSION POINTS

- Add helper modules under `e2e/helpers/` when a setup path is reused by more than one scenario.
- Add narrowly scoped scenario tests for lifecycle-sensitive flows such as restore, close, restart, and policy changes.
- Extend launch helpers before duplicating environment variables or process cleanup behavior.

## TESTING FOCUS

- Run `pnpm build` before `pnpm test:e2e` when tests require `out/main/index.cjs`.
- Verify cleanup paths with failure and timeout cases when launch or quit helpers change.
- Prefer stable UI landmarks and scenario state over brittle timing assumptions.

## ANTI-PATTERNS

- Reusing the developer's real home directory or installed app profile
- Leaving Electron processes, PTYs, temp repositories, or runtime sockets alive after tests
- Sleeping for fixed delays when a deterministic readiness signal exists
- Asserting against private implementation text when a user-visible behavior can be observed
