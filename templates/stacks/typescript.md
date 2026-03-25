# TypeScript Standards

These rules are MANDATORY. Violations fail the task. No exceptions.

---

## 1. Strict Mode

`tsconfig.json` MUST have `"strict": true`. Never disable strict flags to silence errors — fix the code.

```
MANDATORY:
  ├── "strict": true in tsconfig.json
  ├── Never use `any` — use `unknown` for truly unknown types, then narrow
  ├── Never use the `object` type — use a specific interface or Record<K, V>
  └── Never leave function params or return values untyped (no implicit any)
```

```ts
// BAD
function process(data: any) { return data.value; }

// GOOD — unknown forces narrowing before use
function process(data: unknown): string {
  if (typeof data === 'object' && data !== null && 'value' in data) {
    return String((data as { value: unknown }).value);
  }
  throw new Error('Unexpected data shape');
}
```

---

## 2. Interface vs Type

```
USE INTERFACE: object shapes, extendable contracts, class implementations
USE TYPE:      unions, intersections, utility types, mapped/conditional types
```

```ts
// GOOD
interface User { id: string; name: string; email: string; }
interface AdminUser extends User { permissions: string[]; }
type UserRole = 'admin' | 'editor' | 'viewer';
type UserSummary = Pick<User, 'id' | 'name'>;
```

---

## 3. Generic Components

```ts
// GOOD — reusable generic table avoids per-type duplication
interface DataTableProps<T> {
  data: T[];
  columns: Array<{ key: keyof T; label: string }>;
  onRowClick: (row: T) => void;
}
function DataTable<T>({ data, columns, onRowClick }: DataTableProps<T>) { /* ... */ }
```

---

## 4. Zod Schema-Driven Validation

Zod schemas are the single source of truth for runtime validation AND TypeScript types. Never define a type separately when a Zod schema already defines the shape.

```ts
import { z } from 'zod';

// GOOD — schema drives both validation and type
const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  role: z.enum(['admin', 'editor', 'viewer']),
});
type User = z.infer<typeof UserSchema>;  // derive — never duplicate

// BAD — separate type diverges from schema over time
type User = { id: string; email: string; role: string };
```

Use Zod for: form validation, API response parsing, env variable validation, config files.

---

## 5. Error Typing

```ts
// BAD
try { /* ... */ } catch (e: any) { console.log(e.message); }

// GOOD — narrow unknown before use
try { /* ... */ } catch (error: unknown) {
  if (error instanceof Error) console.error(error.message);
  else console.error('Unknown error', error);
}
```

---

## 6. Enums for Fixed Option Sets

```ts
// GOOD — union for simple status flags
type OrderStatus = 'pending' | 'processing' | 'shipped' | 'delivered';

// GOOD — enum when iteration or key mapping is needed
enum Direction { Up = 'UP', Down = 'DOWN', Left = 'LEFT', Right = 'RIGHT' }

// BAD — magic strings scattered through codebase (typos never caught)
if (status === 'pndng') { /* ... */ }
```

---

## 7. Import Ordering

```ts
// 1. React / framework
import React, { useState } from 'react';
// 2. Third-party libraries
import { z } from 'zod';
// 3. Shared / internal aliases
import { Button } from '@/components/ui/Button';
// 4. Local / relative
import { formatDate } from './utils';
import type { UserFilters } from './types';
```

---

## 8. Naming Conventions

| Item                  | Convention              | Example              |
|-----------------------|-------------------------|----------------------|
| React components      | PascalCase              | `UserList.tsx`       |
| Hooks                 | camelCase + `use`       | `useAuth.ts`         |
| Services              | camelCase + `Service`   | `userService.ts`     |
| Types / Interfaces    | PascalCase              | `User`, `UserFilters`|
| Constants             | UPPER_SNAKE_CASE        | `API_BASE_URL`       |
| Non-component files   | camelCase               | `helpers.ts`         |
| Folders               | kebab-case              | `user-profile/`      |
| CSS classes           | kebab-case              | `.user-card`         |
| Boolean props/state   | `is`/`has`/`can` prefix | `isLoading`          |
| Event handler fns     | `handle` prefix         | `handleSubmit`       |
| Callback props        | `on` prefix             | `onSuccess`          |

```ts
// GOOD
const isLoading = true;
function handleSubmit(e: React.FormEvent) { /* ... */ }
<Form onSubmit={handleSubmit} />

// BAD
const loading = true;
function submitForm() { /* ... */ }
<Form submitHandler={submitForm} />
```

---

## Pre-Commit TypeScript Checklist

- [ ] `"strict": true` in `tsconfig.json`
- [ ] No `any` — `unknown` with narrowing used instead
- [ ] No bare `object` type — specific interfaces or `Record<K,V>` only
- [ ] Interfaces for object shapes; types for unions/utilities
- [ ] Zod schemas drive both validation and types via `z.infer`
- [ ] Caught errors narrowed before access (`instanceof Error` check)
- [ ] Enums or union types for all fixed option sets — no magic strings
- [ ] Imports ordered: React → third-party → shared → local
- [ ] Boolean props/state use `is`/`has`/`can` prefix
- [ ] Event handlers use `handle` prefix; callback props use `on` prefix
- [ ] All files, components, hooks, and services follow naming conventions
