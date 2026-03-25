# Tailwind CSS Standards

These rules are MANDATORY. Violations fail the task. No exceptions.

---

## 1. Class-Only Styling

```
MANDATORY:
  ├── Tailwind utility classes ONLY — no inline styles, no CSS modules, no styled-components
  ├── Exception: CSS variables for theme tokens (e.g., bg-[var(--brand-primary)])
  ├── Exception: Animations that require @keyframes — define in tailwind.config or globals.css
  └── NEVER mix Tailwind with other CSS methodologies in the same project
```

**BAD** — `<div style={{ padding: '16px', color: 'red' }}>`

**GOOD** — `<div className="p-4 text-red-500">`

---

## 2. Responsive Design — Mobile First

```
MANDATORY:
  ├── Default styles target mobile — add breakpoints for larger screens
  ├── Breakpoint order: base → sm: → md: → lg: → xl: → 2xl:
  ├── NEVER use max-width breakpoints — always min-width (Tailwind default)
  └── Test at each breakpoint — don't assume intermediate sizes work
```

**BAD** — Desktop-first: `<div className="flex lg:flex max-lg:block">`

**GOOD** — Mobile-first: `<div className="block md:flex">`

---

## 3. Component Extraction Over @apply

```
MANDATORY:
  ├── Extract repeated utility patterns into components — NOT @apply classes
  ├── @apply is allowed ONLY in global base styles (body, headings, links)
  ├── Use a cn() helper for conditional classes
  └── NEVER create .btn, .card, etc. utility classes — make components instead
```

**BAD** — `@apply` in CSS:
```css
.btn-primary { @apply px-4 py-2 bg-blue-500 text-white rounded; }
```

**GOOD** — React component:
```tsx
function Button({ children, variant = 'primary', className }: ButtonProps) {
  return (
    <button className={cn(
      'px-4 py-2 rounded font-medium transition-colors',
      variant === 'primary' && 'bg-blue-500 text-white hover:bg-blue-600',
      variant === 'ghost' && 'bg-transparent hover:bg-gray-100',
      className
    )}>
      {children}
    </button>
  );
}
```

---

## 4. The cn() Helper

```
MANDATORY:
  ├── Use a cn() or clsx() utility for conditional and merged classes
  ├── For Tailwind merge conflicts, use tailwind-merge (twMerge)
  └── Standard pattern: cn = (...classes) => twMerge(clsx(...classes))
```

```typescript
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

---

## 5. Color and Theme System

```
MANDATORY:
  ├── Define colors as CSS variables — not hardcoded Tailwind colors
  ├── Use semantic names (--color-primary, --color-surface) — not visual (--blue-500)
  ├── Support dark mode via CSS variables or Tailwind dark: prefix
  ├── NEVER use arbitrary color values ([#ff6b35]) — add to theme config
  └── Opacity modifiers via Tailwind (text-primary/80) — not rgba
```

**GOOD** — `tailwind.config.js`:
```js
theme: {
  extend: {
    colors: {
      primary: 'var(--color-primary)',
      surface: 'var(--color-surface)',
      border: 'var(--color-border)',
    },
  },
}
```

---

## 6. Spacing and Layout

```
MANDATORY:
  ├── Use Tailwind spacing scale (p-4, gap-3, m-2) — not arbitrary values
  ├── Use Flexbox (flex) or Grid (grid) for layout — not floats or absolute positioning
  ├── gap-* for spacing between flex/grid children — not margins on children
  ├── Consistent spacing: pick a scale (4px base) and stick to it
  └── Arbitrary values ([17px]) only when matching a design spec exactly
```

---

## 7. Dark Mode

```
WHEN SUPPORTING DARK MODE:
  ├── Use class strategy (darkMode: 'class') for user-controlled toggling
  ├── Apply dark: variants alongside base styles — not in separate files
  ├── Test both modes — don't assume dark is just "invert colors"
  └── Ensure sufficient contrast in both modes (WCAG AA: 4.5:1 for text)
```

**GOOD** — `<div className="bg-white text-gray-900 dark:bg-gray-900 dark:text-gray-100">`

---

## 8. Anti-Patterns

```
NEVER:
  ├── Inline styles alongside Tailwind classes
  ├── @apply for component-level styles — make components instead
  ├── Arbitrary values when a Tailwind scale value exists (p-[16px] → p-4)
  ├── !important via ! prefix — fix specificity instead
  ├── Overly long class strings (15+ utilities) — extract a component
  ├── Hardcoded colors ([#hex]) — add to theme config
  └── Margin on grid/flex children for spacing — use gap-* on parent
```

---

## Tailwind Verification Checklist

- [ ] No inline styles — Tailwind classes only
- [ ] Mobile-first responsive (base → sm → md → lg)
- [ ] Repeated patterns extracted to components — not @apply
- [ ] cn() helper used for conditional classes
- [ ] Colors defined as CSS variables / theme config — no hardcoded hex
- [ ] Spacing uses Tailwind scale — minimal arbitrary values
- [ ] Dark mode tested (if applicable)
- [ ] No class strings longer than ~15 utilities — component extracted
