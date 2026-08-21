---
target: current Electron sidebar interface
total_score: 25
p0_count: 0
p1_count: 2
timestamp: 2026-08-19T18-10-16Z
slug: src-renderer-components-layout-treesidebar-tsx
---
# Design Health Score

| # | Heuristic | Score | Key issue |
|---|---|---:|---|
| 1 | Visibility of system status | 2/4 | Selected repository and active worktree are not sufficiently explicit when the repository is collapsed. |
| 2 | Match between system and real world | 3/4 | Developer terminology is appropriate, but untranslated metric labels weaken coherence. |
| 3 | User control and freedom | 3/4 | Search, clear, retry, collapse, and context actions are available. |
| 4 | Consistency and standards | 2/4 | TreeSidebar and RepositorySidebar expose different filter and toolbar models. |
| 5 | Error prevention | 3/4 | Destructive confirmation and disabled states are present; tree reordering lacks an equivalent keyboard path. |
| 6 | Recognition rather than recall | 2/4 | Icon-only toolbar actions and hidden active worktree context require recall. |
| 7 | Flexibility and efficiency | 2/4 | Search, live-agent filtering, recent ordering, and bulk collapse help, but standard keyboard tree navigation is missing. |
| 8 | Aesthetic and minimalist design | 3/4 | Calm and scan-friendly, with weak selected-state hierarchy and a slightly generic floating-panel treatment. |
| 9 | Error recovery | 3/4 | Inline retry, initialization, and actionable empty states are strong. |
| 10 | Help and documentation | 2/4 | Tooltips exist, but hidden filter syntax and icon-only actions are not sufficiently taught. |
| **Total** | | **25/40** | **Acceptable; the structure is sound, but context clarity and accessibility need another pass.** |

# Anti-patterns verdict

The sidebar does not read as generic AI-generated UI. It avoids decorative gradients, glass effects, card grids, ornamental motion, and oversized empty states. Its remaining drift is toward a generic macOS/Finder sidebar rather than Infilux's operational, context-first identity.

The deterministic detector returned zero findings across TreeSidebar.tsx and RepositorySidebar.tsx. This is compatible with the visual review: the primary issues are semantic hierarchy and interaction consistency, not syntactic design anti-patterns.

# Overall impression

The information architecture and progressive disclosure are reasonable. The largest opportunity is to make the selected repository and active worktree unmistakable without increasing visual noise.

# What is working

- Repository, worktree, status, search, and group hierarchy follows familiar developer-tool conventions.
- Bulk collapse, recent-access ordering, loading skeletons, retry paths, and actionable empty states support repeated operational use.
- The surface is restrained and avoids decorative motion or generic AI-product styling.

# Priority issues

## P1: Active context is visually under-specified

When a selected repository with a live worktree is collapsed, the active worktree disappears and the parent repository uses a very quiet context tone. Keep a clear selected treatment on the collapsed parent and expose the active branch/worktree name in its summary.

## P1: Light-theme secondary text is too faint

Paths, counts, group labels, and placeholders are small and visually over-muted. Introduce opaque semantic text tokens with a practical WCAG AA contrast floor for text below 14px.

## P2: Toolbar hierarchy is weak

The header has no textual scope label and can conditionally expose up to six icon actions. Keep two or three frequent actions visible, move secondary maintenance actions to overflow, and keep panel collapse isolated at the trailing edge.

## P2: The repository tree lacks standard keyboard navigation

Each row contains several tab stops but the list does not implement roving tabindex or Arrow, Home, End, Enter, and Space behavior. Implement standard tree semantics and a stable focus treatment.

## P2: The two sidebar variants have diverged

TreeSidebar and RepositorySidebar use different filter discovery, toolbar actions, and path policies. Extract a shared shell, filter model, toolbar schema, and repository-row presentation policy.

# Persona red flags

- Alex, the power user: active branch context is hidden in collapsed rows, toolbar actions have no persistent shortcut cues, and keyboard traversal is inefficient.
- Sam, the keyboard and low-vision user: light-theme metadata is too faint, focus is weaker than required, and the tree lacks standard keyboard semantics.
- Riley, the stress tester: the two sidebar variants expose inconsistent filtering behavior, and long similar paths lose useful distinguishing information.

# Minor observations

- Metric copy such as `1 trees`, `live`, and `sessions` is not localized or plural-aware.
- Full paths consume a line while often showing only a shared prefix; a shortened parent or active branch can carry more decision value.
- The floating light panel uses more shadow and softness than the product's dark-first operational direction calls for.

# Questions to consider

- If the active worktree is the primary execution unit, why may it become completely invisible when its repository is collapsed?
- Which two toolbar actions deserve permanent visibility, and which should move to overflow?
- Are TreeSidebar and RepositorySidebar intentional product modes, or duplicate implementations awaiting convergence?
