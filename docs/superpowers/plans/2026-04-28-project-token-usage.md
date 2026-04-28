# Project Token Usage Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add project-level token usage statistics across multiple agent providers.

**Architecture:** Add a main-process `tokenUsage` domain with provider adapters, normalized shared contracts, IPC/preload access, and a renderer summary panel. Claude and Codex adapters parse existing local usage logs; providers without a stable usage source report capability status instead of estimated numbers.

**Tech Stack:** Electron main process, TypeScript, Vitest, SQLite-ready service boundaries, React renderer.

---

## File Structure

- Create `src/shared/types/tokenUsage.ts`: serializable token usage contracts and provider status types.
- Modify `src/shared/types/index.ts`: export the token usage contracts.
- Modify `src/shared/types/ipc.ts`: add token usage IPC channels.
- Create `src/main/services/tokenUsage/TokenUsageTypes.ts`: main-process internal adapter types.
- Create `src/main/services/tokenUsage/TokenUsageAccumulator.ts`: pure aggregation helpers.
- Create `src/main/services/tokenUsage/ClaudeUsageAdapter.ts`: Claude JSONL parser.
- Create `src/main/services/tokenUsage/CodexUsageAdapter.ts`: Codex JSONL parser.
- Create `src/main/services/tokenUsage/StaticUsageAdapter.ts`: unsupported provider adapter.
- Create `src/main/services/tokenUsage/TokenUsageService.ts`: orchestrates adapters and returns project summaries.
- Create `src/main/services/tokenUsage/index.ts`: domain exports.
- Create tests under `src/main/services/tokenUsage/__tests__/`.
- Create `src/main/ipc/tokenUsage.ts`: IPC handlers.
- Modify `src/main/ipc/index.ts`: register token usage handlers.
- Modify `src/preload/index.ts`: expose token usage bridge.
- Modify `src/preload/__tests__/index.test.ts`: contract coverage.
- Create `src/renderer/components/layout/ProjectTokenUsageSummary.tsx`: compact resource drawer summary.
- Modify `src/renderer/components/layout/AppResourceManagerDrawer.tsx`: load and render token usage summary.

## Chunk 1: Core Contracts And Parsers

- [ ] Write failing tests for Claude and Codex log parsing.
- [ ] Add shared token usage contracts.
- [ ] Implement normalized token counters and aggregation.
- [ ] Implement Claude and Codex adapters.
- [ ] Add unsupported provider adapters for Gemini, Cursor, Droid, Auggie, OpenCode, and custom.
- [ ] Run focused service tests.

## Chunk 2: IPC And Preload

- [ ] Write failing IPC/preload contract tests.
- [ ] Add token usage IPC channels and handlers.
- [ ] Expose `window.electronAPI.tokenUsage.getProjectUsage`.
- [ ] Register handlers in the main IPC registry.
- [ ] Run focused IPC/preload tests.

## Chunk 3: Renderer Summary

- [ ] Add a focused renderer component for project token usage cards.
- [ ] Load token usage when the resource drawer opens.
- [ ] Display provider capability states clearly without estimating unsupported providers.
- [ ] Run targeted renderer tests or source-level policy tests if component rendering setup is not practical.

## Verification

- `pnpm test src/main/services/tokenUsage/__tests__/*.test.ts`
- `pnpm test src/main/ipc/__tests__/tokenUsage.test.ts src/preload/__tests__/index.test.ts`
- `pnpm typecheck`

