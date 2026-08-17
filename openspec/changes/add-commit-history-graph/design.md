## Context

Source Control already owns commit selection, pagination, and diff viewing. This change adds a pure topology model and renderer beside that workflow without changing Git mutation actions.

## Goals / Non-Goals

**Goals:** deterministic lane layout, merge-parent visualization, and semantic comparison markers.

**Non-Goals:** rewriting history, changing commit actions, or rendering the entire repository graph at once.

## Decisions

Add graph row types to shared Git contracts and build lanes from the loaded log window in the Git domain. Keep lane calculation pure and testable. Render SVG paths in a dedicated Source Control leaf component while the existing history list remains responsible for selection and accessibility.

Incoming and outgoing markers are synthetic rows with explicit kinds, never fabricated commit hashes. Parsing textual `git log --graph` output is rejected because it is not stable enough for typed rendering, testing, or remote adapters.

## Risks / Trade-offs

- Dense merge histories increase lane count → constrain rendering to loaded pages and use compact columns.
- Graph color alone is insufficient → preserve reference labels and accessible commit text.
- Remote Git adapters may return limited data → hide the enhancement rather than break history.

## Migration Plan

Add graph data alongside existing history responses, render it only when complete, and fall back to the current list when an adapter cannot provide graph metadata.
