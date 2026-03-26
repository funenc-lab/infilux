# Design Context

## Users

Primary users are individual developers working across multiple repositories, Git worktrees, terminals, and AI coding agents in parallel.

They use Infilux as an operational cockpit to keep several execution contexts alive at once, monitor runtime state continuously, switch focus quickly, and intervene only when needed without losing momentum.

The primary job to be done is not generic file browsing or project organization. It is high-efficiency orchestration of parallel development flows with clear situational awareness.

## Brand Personality

Calm, futuristic, restrained-premium.

The product should feel technically confident, operationally precise, and quietly advanced. It should evoke control, professionalism, terminal-native fluency, and a subtle sense of forward-looking capability without becoming flashy, playful, or noisy.

## Aesthetic Direction

This product should read as a dark-first AI collaboration console for serious solo builders.

Preferred direction:

- command-center composure
- professional, high-signal hierarchy
- terminal-adjacent visual language
- restrained futuristic character
- premium minimalism with operational density
- customizable color identity through presets or user-defined themes

The visual tone should emphasize dark surfaces, crisp status semantics, compact scanability, and a sense of deliberate control. "Future" should feel mature and engineered, not neon, sci-fi, or entertainment-oriented.

Anti-directions:

- Finder-style organization tool aesthetics
- generic white-card SaaS dashboards
- consumer productivity softness
- glassmorphism, decorative gradients, glowing cyberpunk effects
- oversized poster-like empty states
- visual decoration that competes with status communication

## Design Principles

1. Context first: repository, worktree, agent, and live runtime state must be readable at a glance.
2. Status is structural: color, contrast, and emphasis should express execution state, not decoration.
3. Dark-first professionalism: default visual decisions should optimize for focused, long-duration use in a dark environment.
4. Futuristic but restrained: advanced feeling should come from precision, density, motion, and polish rather than effects.
5. Terminal-native clarity: the interface should preserve the credibility, directness, and scanability of professional developer tools.
6. Controlled personalization: presets and user-defined color customization are welcome, but must not break hierarchy, legibility, or state semantics.

## Implementation Guidance

- Treat `docs/design-system.md` as the component and token rulebook.
- Treat this file as the persistent product-style intent behind those rules.
- When design choices conflict, prefer clarity of runtime context over decoration.
- Prefer dark-first contrast tuning even when supporting light mode.
- Keep customization bounded by semantic state consistency and readability.
