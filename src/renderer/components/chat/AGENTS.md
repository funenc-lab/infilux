# CHAT COMPONENTS GUIDE

This directory owns the agent panel, session UI, agent terminals, and related chat-side policies.

This guide extends `src/renderer/components/AGENTS.md`.

## RESPONSIBILITIES

- Render agent session groups, input surfaces, and session status
- Coordinate agent-panel presentation with session, terminal, and settings stores
- Keep small policy modules for mount, availability, rollover, and prompt behavior

## RULES

- The panel may orchestrate several stores, but transport and persistence stay outside renderer UI.
- Session grouping, mount policy, and availability logic should stay extractable and testable.
- Keep agent-specific naming and presentation helpers close to this domain.
- Preserve remote and temporary-workspace behavior when adjusting session flows.

## HOTSPOTS

- `AgentPanel.tsx`
- `AgentTerminal.tsx`
- policy/model helpers in this directory

## ANTI-PATTERNS

- Mixing PTY transport details into components
- Recreating agent session state outside `stores/agentSessions.ts`
- Burying complex mount or rollover rules directly in JSX
