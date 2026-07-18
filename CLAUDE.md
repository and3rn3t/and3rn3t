# CLAUDE.md — and3rn3t portfolio

**Read `AGENTS.md` first — it is the single source of truth for stack, commands, and conventions.** This file only holds Claude-specific additions.

## Claude-specific notes

- Run `pnpm validate` before declaring a change done.
- Prefer the Cloudflare MCP connector (Cowork sessions) for inspecting the Worker/KV over guessing from config.

## CSS Guidelines

**Always use CSS variables from the design system.** No hardcoded values.

### Typography Scale

- Font sizes: Use `--font-size-xs` through `--font-size-7xl` (never hardcode `0.75rem`, `1rem`, etc.)
- Line heights: Use `--line-height-tight` (1.2), `--line-height-snug` (1.375), `--line-height-normal` (1.5), `--line-height-relaxed` (1.625), `--line-height-loose` (1.75)
- Font weights: Use `--font-weight-light`, `--font-weight-normal`, `--font-weight-medium`, `--font-weight-semibold`, `--font-weight-bold`
- Letter spacing: Use `--letter-spacing-tight` (-0.02em), `--letter-spacing-normal` (0), `--letter-spacing-wide` (0.06em), `--letter-spacing-wider` (0.1em)

### Spacing Scale (8px base)

- **NEVER use hardcoded px/rem values for padding, margin, or gap.**
- Use: `--space-1` (4px), `--space-2` (8px), `--space-3` (12px), `--space-4` (16px), `--space-5` (20px), `--space-6` (24px), `--space-8` (32px), `--space-10` (40px), `--space-12` (48px), `--space-16` (64px), `--space-20` (80px), `--space-24` (96px), `--space-32` (128px)
- Example: `padding: var(--space-3) var(--space-4)` not `padding: 12px 16px`

### Responsive Typography

- Hero/display text may use `clamp()` for responsive scaling (documented exceptions only)
- Example: `font-size: clamp(2.75rem, 6.5vw, 4.5rem);`

### Validation

- `pnpm validate` will catch linting, formatting, and build issues.
- Stylelint rules enforce consistent spacing and CSS variable patterns.
