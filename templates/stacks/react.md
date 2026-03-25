# React Standards

These rules are MANDATORY. Violations fail the task. No exceptions.

---

## 1. Server State — React Query

```
MANDATORY:
  ├── Use React Query for ALL server data fetching — NEVER useEffect + fetch
  ├── NEVER store server data in useState — it belongs in the query cache
  ├── useQuery for reads, useMutation for writes
  └── Set staleTime explicitly — do not rely on defaults
```

**BAD** — `useEffect(() => { fetch(...).then(setUsers); }, []);`

**GOOD**
```tsx
const { data: users } = useQuery({
  queryKey: ['users'],
  queryFn: api.getUsers,
  staleTime: 5 * 60 * 1000,
});
```

---

## 2. Component Design

```
MANDATORY:
  ├── Max 150 lines per component file — extract if longer
  ├── Container/Presenter split: containers fetch data, presenters render UI
  ├── Extract complex logic into custom hooks (useXxx)
  ├── One component per file
  └── No business logic in JSX — compute values above the return statement
```

**BAD** — 300-line component mixing fetch, transform, and render logic.

**GOOD**
```tsx
// Container fetches; Presenter renders
function UserListContainer() {
  const { data } = useQuery({ queryKey: ['users'], queryFn: api.getUsers });
  return <UserList users={data ?? []} />;
}
function UserList({ users }: { users: User[] }) {
  return <ul>{users.map(u => <UserRow key={u.id} user={u} />)}</ul>;
}
```

---

## 3. Props Rules

```
MANDATORY:
  ├── Define props as TypeScript interfaces
  ├── Destructure props in the function signature
  ├── NEVER use defaultProps — use default parameter values instead
  └── Avoid prop drilling beyond 2 levels — use Context or composition
```

**GOOD**
```tsx
interface ButtonProps { label: string; variant?: 'primary' | 'secondary'; }
function Button({ label, variant = 'primary' }: ButtonProps) { ... }
```

---

## 4. Key Prop Rules

```
MANDATORY:
  ├── NEVER use array index as key on dynamic (add/remove/reorder) lists
  ├── Use stable unique IDs from data (item.id, item.slug)
  └── Never generate keys at render time (Math.random(), Date.now())
```

**BAD** — `items.map((item, i) => <Row key={i} />)`

**GOOD** — `items.map(item => <Row key={item.id} />)`

---

## 5. Hooks Rules

```
MANDATORY:
  ├── Only call hooks at the top level — NEVER inside conditionals or loops
  ├── NEVER call a hook conditionally — restructure using early JSX returns
  ├── Custom hooks MUST start with "use" prefix
  └── One concern per custom hook
```

**BAD** — `if (isLoggedIn) { const data = useUserData(); }`

**GOOD** — Call `useUserData()` unconditionally; return early in JSX if not logged in.

---

## 6. Memoization

```
USE SPARINGLY — profile first, optimize second:
  ├── React.memo: only when parent re-renders often AND child props rarely change
  ├── useMemo: only for computationally expensive operations (not string/array literals)
  └── useCallback: only when the function is passed to a memoized child or is a
        useEffect dependency
```

**BAD** — `const label = useMemo(() => \`Hello, ${name}\`, [name]);` (trivial — no benefit)

**GOOD** — `const sorted = useMemo(() => items.sort(expensiveSort), [items]);`

---

## 7. Lazy Loading

```
MANDATORY for route-level components:
  ├── Wrap with React.lazy() + Suspense
  ├── Always provide a Suspense fallback (skeleton or spinner — not null)
  └── Group related routes in one lazy chunk to minimize round trips
```

```tsx
const Dashboard = React.lazy(() => import('./Dashboard'));
<Suspense fallback={<DashboardSkeleton />}><Dashboard /></Suspense>
```

---

## 8. Error Boundaries

```
MANDATORY:
  ├── Wrap every route and major feature section in an ErrorBoundary
  ├── Display a user-friendly fallback UI — never a blank screen
  ├── Log to error tracking (Sentry) in componentDidCatch
  └── Use granular boundaries — one top-level boundary is not enough
```

---

## 9. Accessibility (a11y)

```
MANDATORY:
  ├── Use semantic HTML (button, nav, main, header, section)
  ├── All interactive elements MUST be keyboard-navigable (Tab, Enter, Escape)
  ├── Images require alt text (alt="" for decorative)
  ├── Form inputs MUST have associated <label> (htmlFor + id)
  ├── Modals: trap focus inside, restore on close, Escape closes
  ├── Icon-only buttons require aria-label
  └── NEVER remove focus outlines — style them, never hide them
```

**BAD** — `<div onClick={del}>Delete</div>` / `<img src={x} />`

**GOOD** — `<button onClick={del} aria-label="Delete">Delete</button>` / `<img src={x} alt="Profile photo" />`

---

## 10. State Management — When to Use What

```
MANDATORY — choose the right tool for the data type:
  ├── UI toggles, form inputs          → useState
  ├── Complex local state (multi-step)  → useReducer
  ├── Server/API data                   → React Query (NEVER useState)
  ├── Auth session, permissions         → React Context
  ├── Theme preference                  → React Context + localStorage
  └── URL state (page, filters)         → React Router (useSearchParams)
```

**Rules:**
- Never duplicate server state in local state — React Query is the single source of truth for API data
- Lift state only when needed — if two siblings need the same state, lift to parent, not a global store
- Derive, don't store — if a value can be computed from existing state, compute it

**BAD** — storing derived state:
```tsx
const [users, setUsers] = useState(allUsers);
const [filteredUsers, setFilteredUsers] = useState([]);
const [userCount, setUserCount] = useState(0);
```

**GOOD** — derive from source:
```tsx
const [filter, setFilter] = useState('all');
const filteredUsers = useMemo(
  () => users.filter(u => filter === 'all' || u.status === filter),
  [users, filter]
);
const userCount = filteredUsers.length;
```

---

## 11. Form Management — react-hook-form + Zod

```
MANDATORY when project uses forms:
  ├── One Zod schema per form — schema is the single source of truth for validation
  ├── Use react-hook-form with zodResolver — NEVER validate in event handlers
  ├── Show field-level errors below the field — not in a toast
  ├── Disable submit button while submitting
  ├── Use noValidate on <form> — browser validation conflicts with custom validation
  └── Use setError('root', ...) for server-side errors
```

**GOOD**
```tsx
const schema = z.object({
  email: z.string().email('Enter a valid email'),
  name: z.string().min(2, 'Name must be at least 2 characters'),
});
type FormData = z.infer<typeof schema>;

function MyForm() {
  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });
  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <label htmlFor="email">Email</label>
      <input id="email" {...register('email')} />
      {errors.email && <span className="error">{errors.email.message}</span>}
      <button type="submit" disabled={isSubmitting}>Save</button>
    </form>
  );
}
```

---

## 12. React Naming Conventions

```
MANDATORY:
  ├── Components:      PascalCase          (UserList.tsx, DataTable.tsx)
  ├── Hooks:           camelCase + use      (useAuth.ts, useUsers.ts)
  ├── Services:        camelCase + Service  (userService.ts)
  ├── Event handlers:  handle prefix        (handleClick, handleSubmit)
  ├── Callback props:  on prefix            (onClick, onClose, onChange)
  ├── Boolean state:   is/has/can prefix    (isOpen, hasError, canEdit)
  ├── Folders:         kebab-case           (user-settings/, danger-window/)
  └── Non-component files: camelCase        (helpers.ts, permissions.ts)
```

---

## 13. Anti-Patterns

```
NEVER:
  ├── useEffect for data fetching (use React Query — Section 1)
  ├── Prop drilling beyond 2 levels
  ├── Array index as key on dynamic lists (Section 4)
  ├── Conditional hook calls (Section 5)
  ├── Direct state mutation: state.list.push(x) — return new objects/arrays
  ├── console.log in committed code
  ├── Derived state in useState when it can be computed (Section 10)
  ├── Validate forms in event handlers (use react-hook-form + zod — Section 11)
  └── dangerouslySetInnerHTML without sanitization — see _security.md
```

---

## React Verification Checklist

- [ ] Server data fetched with React Query — no `useEffect` + fetch
- [ ] No component exceeds 150 lines
- [ ] Container/Presenter pattern applied to data-fetching components
- [ ] All props typed with TypeScript interfaces
- [ ] No array index as key on dynamic lists
- [ ] No conditional hook calls
- [ ] Memoization justified — not preemptive
- [ ] Route components use `React.lazy` + `Suspense` with a fallback
- [ ] `ErrorBoundary` wraps each major feature section
- [ ] All interactive elements keyboard-accessible with ARIA labels
- [ ] No `console.log` in committed code
- [ ] No direct state mutations — always return new objects/arrays
- [ ] `dangerouslySetInnerHTML` usage reviewed against `_security.md`
- [ ] State tool matches data type (useState/useReducer/Context/React Query/Router)
- [ ] No derived state in useState — compute from source
- [ ] Forms use react-hook-form + zod — no manual validation in handlers
- [ ] React naming conventions followed (handle*, on*, is/has/can)
