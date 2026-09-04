# Contract: Design Brief

## Owner
Domain: design-brief (generated during partition phase)

## Consumers
- `commands/gsd-t-plan.md` — UI task descriptions reference design brief
- Future: `commands/gsd-t-execute.md` — inject into UI-domain subagent prompts (post-M32)

## Storage Location

```
.gsd-t/contracts/design-brief.md
```

## Trigger Conditions (When to Generate)

Generate a design brief during partition if ANY of the following are detected:

| Signal                              | Detection Method                          |
|-------------------------------------|-------------------------------------------|
| React in stack                      | `"react"` in `package.json` dependencies  |
| Vue in stack                        | `"vue"` in `package.json` dependencies    |
| Svelte in stack                     | `"svelte"` in `package.json` dependencies |
| Next.js in stack                    | `"next"` in `package.json` dependencies   |
| Flutter project                     | `pubspec.yaml` exists                     |
| CSS/SCSS files in scope             | `.css`, `.scss`, `.sass` files present    |
| Component files in scope            | `.jsx`, `.tsx`, `.svelte`, `.vue` files   |
| Tailwind config exists              | `tailwind.config.js` or `.ts` exists      |

If NONE of the above → skip design brief generation entirely (no artifact created, no step shown).

## Design Brief File Format

```markdown
# Design Brief

## Project
{project name}

## Color Palette
| Role      | Value   | Usage                    |
|-----------|---------|--------------------------|
| Primary   | #000000 | CTA buttons, links       |
| Secondary | #000000 | Secondary actions        |
| Background | #ffffff | Page background         |
| Surface   | #f5f5f5 | Cards, panels            |
| Error     | #ef4444 | Error states             |
| Success   | #22c55e | Success states           |

## Typography
| Role       | Family         | Size  | Weight |
|------------|----------------|-------|--------|
| Heading 1  | {font}         | 2rem  | 700    |
| Heading 2  | {font}         | 1.5rem | 600   |
| Body       | {font}         | 1rem  | 400    |
| Caption    | {font}         | 0.875rem | 400 |
| Code       | monospace      | 0.875rem | 400 |

## Spacing System
- Base unit: 4px
- Scale: 4, 8, 12, 16, 24, 32, 48, 64, 96

## Component Patterns
- {e.g., "Use shadcn/ui primitives for all interactive elements"}
- {e.g., "Card pattern: rounded-lg border shadow-sm p-4"}
- {e.g., "Form pattern: label above input, error below"}

## Layout Principles
- {e.g., "Max content width: 1280px, centered"}
- {e.g., "Sidebar: 240px fixed, main content fluid"}
- {e.g., "Mobile-first: stack to horizontal at md breakpoint"}

## Interaction Patterns
- {e.g., "Loading: skeleton screens, not spinners"}
- {e.g., "Empty states: illustration + CTA"}
- {e.g., "Transitions: 150ms ease for state changes"}

## Tone & Voice
{Derived from Quality North Star or brand voice guidelines}
{e.g., "Professional but approachable. Error messages are friendly and actionable."}
```

## Source Priority for Brief Generation

1. **Tailwind config** (`tailwind.config.js/ts`) → extract `theme.colors`, `theme.fontFamily`, `theme.spacing`
2. **Design token files** (`theme.ts`, `tokens.css`, `design-tokens.json`) → extract token values
3. **Quality persona** (`## Quality North Star` in CLAUDE.md) → use for Tone & Voice section
4. **Defaults** → use sensible web defaults if no signals found (Tailwind defaults, system fonts, 4px spacing)

## Preservation Rule

If `.gsd-t/contracts/design-brief.md` already exists → do NOT overwrite. Prompt user or skip silently. User-customized briefs are authoritative.

## Non-UI Projects

If no UI signals detected → no artifact created. Inject nothing. Design brief contract is inactive.
