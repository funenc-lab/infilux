# WebGL Renderer Completeness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make WebGL rendering effective and stable for every configured terminal surface.

**Architecture:** `xtermTerminalOptions` remains the source of runtime terminal option normalization. `useXterm` consumes the normalized font family for construction, updates, cache signatures, and renderer cleanup. Agent components stop introducing layout-dependent renderer overrides while the explicit compatibility hook option and context-loss fallback remain available.

**Tech Stack:** React 19, TypeScript 5.9, xterm.js 6 beta, Vitest, Electron 39

## Global Constraints

- Preserve stored user font settings without migration.
- Preserve explicit DOM compatibility requests and context-loss fallback.
- Add one-to-one regression coverage before each production change.
- Do not add dependencies or a new renderer state source.
- Do not commit implementation changes until explicitly requested.

---

### Task 1: Reuse the resolved runtime font family

**Files:**
- Modify: `src/renderer/hooks/xtermTerminalOptions.ts`
- Modify: `src/renderer/hooks/useXterm.ts`
- Test: `src/renderer/hooks/__tests__/useXterm.test.ts`
- Test: `src/renderer/hooks/__tests__/xtermTerminalOptions.test.ts`

**Interfaces:**
- Produces: `resolveTerminalFontFamily(platform: string, configuredFontFamily: string): string`
- Consumes: `getRendererEnvironment().platform`

- [x] **Step 1: Write failing integration assertions**

Record terminal constructor options in the hook harness and assert that a font-size rerender leaves `PingFang SC` in `terminal.options.fontFamily`.

- [x] **Step 2: Verify RED**

Run:

```bash
pnpm vitest run src/renderer/hooks/__tests__/useXterm.test.ts -t "preserves the resolved CJK font fallback"
```

Expected: FAIL because the dynamic effect writes the raw configured family.

- [x] **Step 3: Implement one runtime font resolver path**

Export the existing resolver and derive `runtimeFontFamily` once in `useXterm`:

```ts
const runtimeFontFamily = useMemo(
  () => resolveTerminalFontFamily(getRendererEnvironment().platform, settings.fontFamily),
  [settings.fontFamily]
);
```

Use it in the WebGL signature and dynamic option update. Keep `buildXtermTerminalOptions` using the same resolver.

- [x] **Step 4: Verify GREEN**

Run both hook and terminal-option suites and expect all tests to pass.

### Task 2: Honor the configured renderer for Agent terminals

**Files:**
- Modify: `src/renderer/components/chat/AgentTerminal.tsx`
- Modify: `src/renderer/components/chat/AgentPanel.tsx`
- Delete: `src/renderer/components/chat/agentTerminalRendererPolicy.ts`
- Delete: `src/renderer/components/chat/__tests__/agentTerminalRendererPolicy.test.ts`
- Test: `src/renderer/components/chat/__tests__/AgentTerminal.integration.test.ts`

**Interfaces:**
- Preserves: `preferCompatibilityRenderer?: boolean` as an explicit override
- Changes: default value from `true` to `false`

- [x] **Step 1: Change the integration expectation first**

Assert that an Agent terminal passes `preferCompatibilityRenderer: false` by default and still honors an explicit `true` prop.

- [x] **Step 2: Verify RED**

Run:

```bash
pnpm vitest run src/renderer/components/chat/__tests__/AgentTerminal.integration.test.ts -t "configured renderer"
```

Expected: FAIL because the component currently defaults to compatibility mode.

- [x] **Step 3: Remove layout-dependent compatibility policy**

Set the Agent terminal prop default to `false`, remove the `AgentPanel` policy import/calculation/prop, and delete the now-unused policy module and its tests.

- [x] **Step 4: Verify GREEN**

Run Agent terminal and Agent panel focused suites and expect all tests to pass.

### Task 3: Dispose failed WebGL activation

**Files:**
- Modify: `src/renderer/hooks/useXterm.ts`
- Test: `src/renderer/hooks/__tests__/useXterm.test.ts`

**Interfaces:**
- Preserves: DOM fallback after WebGL constructor or activation errors

- [x] **Step 1: Add a failing activation cleanup test**

Allow the xterm mock's `loadAddon` to throw, then assert that the created WebGL addon is disposed exactly once.

- [x] **Step 2: Verify RED**

Run:

```bash
pnpm vitest run src/renderer/hooks/__tests__/useXterm.test.ts -t "disposes a WebGL addon when activation fails"
```

Expected: FAIL because the catch path currently loses the addon reference.

- [x] **Step 3: Retain and dispose the activation candidate**

Declare the candidate outside `try`, assign it before `loadAddon`, and dispose it in `catch`:

```ts
let webglAddon: WebglAddon | null = null;
try {
  webglAddon = new WebglAddon();
  terminal.loadAddon(webglAddon);
  rendererAddonRef.current = webglAddon;
} catch (error) {
  webglAddon?.dispose();
  // Keep existing fallback state and warning.
}
```

- [x] **Step 4: Verify GREEN and regressions**

Run:

```bash
pnpm typecheck
pnpm lint
pnpm test
```

Then use the Electron CDP probe to verify a nonblank WebGL canvas, CJK glyphs, renderer selection, and no console errors. Confirm the debug process is stopped and `git status --short --branch` contains only intended implementation and plan changes.
