## Why

Infilux supports custom CLI agents but does not provide first-class catalog entries for Pi and OMP.
Users must manually configure commands and lose capability-aware routing, installation detection, and
consistent session behavior.

## What Changes

- Add Pi and OMP as built-in agent definitions only after their CLI command, version detection,
  launch contract, completion signal, and provider-session behavior are verified.
- Extend capability metadata and settings presentation without changing existing custom-agent support.
- Treat unsupported versions or unavailable commands as unavailable built-ins, not launch failures.

## Capabilities

### New Capabilities

- `built-in-pi-and-omp-agents`: Detect, configure, launch, and recover supported Pi and OMP CLI
  agents through the same catalog-driven behavior as existing built-ins.

### Modified Capabilities

- None.

## Impact

- **Shared contracts:** catalog identifiers, capability metadata, and completion policy.
- **Main process:** CLI detection, installation guidance, and provider/session compatibility checks.
- **Renderer:** agent settings and selection surfaces derived from the shared catalog.
- **Acceptance criteria:** unavailable CLIs are clearly reported, supported CLIs launch with the
  declared contract, and custom agents remain unaffected.
