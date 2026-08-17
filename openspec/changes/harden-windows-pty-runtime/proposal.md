## Why

Infilux directly owns Windows PTY processes through node-pty, leaving terminal startup, cleanup, and
backend compatibility vulnerable to platform-specific failures. Codex and long-running agent sessions
need deterministic fallback and cleanup behavior on supported Windows releases.

## What Changes

- Add an explicit Windows PTY backend policy that selects ConPTY or WinPTY from detected platform
  capability and reports the selected backend to higher layers.
- Isolate Windows PTY creation and control in a helper process with bounded create and destroy
  operations, ordered output activation, and process-tree cleanup.
- Preserve the existing terminal/session contract for all non-Windows platforms.
- Add packaging and lifecycle tests for helper resolution, cancellation, timeout, and shutdown.

## Capabilities

### New Capabilities

- `windows-pty-runtime`: Create and manage Windows terminal sessions with an explicit backend,
  isolated helper lifecycle, and recoverable failure results.

### Modified Capabilities

- None.

## Impact

- **Main process:** terminal transport, runtime packaging, and Windows process cleanup.
- **Shared contracts:** serializable backend and diagnostic metadata only.
- **Renderer:** no new terminal ownership; optional diagnostic display may consume metadata.
- **Platforms:** Windows-only behavior changes; macOS and Linux retain current direct PTY behavior.
- **Acceptance criteria:** no orphan helper or PTY process remains after failed creation, cancellation,
  session detach, or application shutdown; compatible Windows versions select ConPTY and unsupported
  versions select WinPTY predictably.
