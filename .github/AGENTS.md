# GITHUB AUTOMATION GUIDE

This directory owns GitHub workflows, issue templates, and repository automation metadata.

This guide extends the root `AGENTS.md`.

## RESPONSIBILITIES

- Keep CI, release, review, and package-manager workflows aligned with the current Infilux build
- Maintain issue templates and automation metadata without duplicating product or engineering docs
- Preserve workflow compatibility with the scripts and package-manager commands used by the repository

## RULES

- Treat `.github/workflows/build.yml` as the primary release and packaged-build workflow.
- Keep workflow commands explicit and pinned to repository scripts when possible.
- Use `pnpm` for project commands unless a workflow is intentionally validating another package manager path.
- Keep artifact names, app names, cache keys, and log labels aligned with the current `Infilux` product identity.
- Preserve legacy names only when the workflow is explicitly testing backward compatibility.
- Prefer changing helper scripts under `scripts/` when workflow logic becomes complex.

## EXTENSION POINTS

- Add workflow-specific validation through `scripts/__tests__/` before broadening CI behavior.
- Add new issue templates only when they capture structured information that maintainers actively use.
- Add release-note or packaging automation by composing existing scripts instead of embedding long shell blocks.

## TESTING FOCUS

- Validate workflow changes with focused tests in `scripts/__tests__/` when scripts or workflow semantics are touched.
- Check macOS signing, packaging, artifact naming, and package-manager behavior when changing build or release workflows.

## ANTI-PATTERNS

- Embedding large untested shell programs directly in workflow YAML
- Reintroducing stale EnsoAI names for current Infilux build outputs
- Adding secrets, tokens, or local absolute paths to workflow files
- Duplicating release metadata logic that already belongs in `scripts/release/`
