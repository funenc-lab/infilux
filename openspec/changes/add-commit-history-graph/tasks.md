## 1. Graph Data Contract

- [ ] 1.1 Add failing shared Git type tests for graph rows, lanes, parent transitions, and synthetic comparison markers in `src/shared/types/__tests__/commitGraph.test.ts`.
- [ ] 1.2 Extend `src/shared/types/git.ts` with serializable graph metadata while preserving existing history response compatibility.

## 2. Git Domain Topology

- [ ] 2.1 Add failing layout tests for linear commits, branches, merges, HEAD, incoming, outgoing, and pagination boundaries in `src/main/services/git/__tests__/gitGraphFormat.test.ts`.
- [ ] 2.2 Create `src/main/services/git/gitGraphFormat.ts` as a pure graph-row formatter over loaded Git history.
- [ ] 2.3 Extend Git history shaping and IPC tests so local and remote adapters return graph metadata only when complete and retain current history fallback behavior.

## 3. Source Control Presentation

- [ ] 3.1 Add failing renderer tests for graph lane rendering, synthetic marker semantics, keyboard selection, and accessible commit labels in `src/renderer/components/source-control/__tests__/CommitGraph.test.tsx`.
- [ ] 3.2 Create `CommitGraph.tsx`, lane and reference helpers, then integrate them into the existing history list without changing commit selection ownership.
- [ ] 3.3 Add a bounded-history integration test proving pagination preserves selection and does not render the full repository graph.

## 4. Verification

- [ ] 4.1 Run focused Git service, IPC, and Source Control tests for local and remote repository fixtures.
- [ ] 4.2 Run `pnpm typecheck`, `pnpm lint`, and `openspec validate add-commit-history-graph --strict` before committing.
