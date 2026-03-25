# Zustand Standards

These rules are MANDATORY. Violations fail the task. No exceptions.

---

## 1. Store Structure

```
MANDATORY:
  ├── One store per domain: useAuthStore, useCartStore, useUIStore
  ├── Zustand for CLIENT state only — use React Query for server data
  ├── Define store interface with TypeScript
  ├── Group related state and actions together
  ├── Export a single custom hook per store
  └── NEVER create a single global store for everything
```

**GOOD**
```typescript
interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => void;
  setUser: (user: User) => void;
}

export const useAuthStore = create<AuthState>()((set, get) => ({
  user: null,
  token: null,
  isAuthenticated: false,

  login: async (credentials) => {
    const { user, token } = await authService.login(credentials);
    set({ user, token, isAuthenticated: true });
  },

  logout: () => {
    set({ user: null, token: null, isAuthenticated: false });
  },

  setUser: (user) => set({ user }),
}));
```

---

## 2. Selectors — Minimize Re-renders

```
MANDATORY:
  ├── Select only what the component needs — NEVER use the entire store
  ├── Use individual selectors for each piece of state
  ├── Create reusable selector hooks for common patterns
  └── Use shallow equality for object selections
```

**BAD** — triggers re-render on ANY store change:
```typescript
const store = useAuthStore();
```

**GOOD** — only re-renders when user changes:
```typescript
const user = useAuthStore((state) => state.user);
const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

// For multiple values, use shallow:
import { useShallow } from 'zustand/react/shallow';
const { user, isAuthenticated } = useAuthStore(
  useShallow((state) => ({ user: state.user, isAuthenticated: state.isAuthenticated }))
);
```

---

## 3. Actions and Updates

```
MANDATORY:
  ├── Actions defined inside create() — not as external functions
  ├── Use set() for state updates — NEVER mutate state directly
  ├── Use get() to read current state inside actions
  ├── Async actions: handle loading/error inside the action
  └── Partial updates: set() merges by default — only pass changed fields
```

**GOOD**
```typescript
addItem: (item) => set((state) => ({
  items: [...state.items, item],
  total: state.total + item.price,
})),

removeItem: (itemId) => set((state) => ({
  items: state.items.filter(i => i.id !== itemId),
})),
```

---

## 4. Middleware

```
WHEN NEEDED:
  ├── persist: for localStorage/sessionStorage persistence
  ├── devtools: for Redux DevTools integration (dev only)
  ├── immer: for mutable-style updates on complex nested state
  ├── Stack middleware with proper TypeScript: create<State>()(devtools(persist(...)))
  └── Configure persist with a unique name and version for migration support
```

**GOOD**
```typescript
export const useCartStore = create<CartState>()(
  devtools(
    persist(
      (set, get) => ({
        items: [],
        addItem: (item) => set((state) => ({ items: [...state.items, item] })),
        clear: () => set({ items: [] }),
      }),
      {
        name: 'cart-storage',
        version: 1,
      }
    ),
    { name: 'CartStore' }
  )
);
```

---

## 5. Slices Pattern (Large Stores)

```
WHEN A STORE GROWS BEYOND 10 ACTIONS:
  ├── Split into slices — each slice manages a subset of state
  ├── Combine slices in a single create() call
  ├── Each slice has its own interface
  └── Slices can read other slices via get()
```

**GOOD**
```typescript
interface UserSlice {
  user: User | null;
  setUser: (user: User) => void;
}

interface SettingsSlice {
  theme: 'light' | 'dark';
  toggleTheme: () => void;
}

const createUserSlice: StateCreator<UserSlice & SettingsSlice, [], [], UserSlice> = (set) => ({
  user: null,
  setUser: (user) => set({ user }),
});

const createSettingsSlice: StateCreator<UserSlice & SettingsSlice, [], [], SettingsSlice> = (set) => ({
  theme: 'light',
  toggleTheme: () => set((state) => ({ theme: state.theme === 'light' ? 'dark' : 'light' })),
});

export const useAppStore = create<UserSlice & SettingsSlice>()((...args) => ({
  ...createUserSlice(...args),
  ...createSettingsSlice(...args),
}));
```

---

## 6. Anti-Patterns

```
NEVER:
  ├── Store server data in Zustand — use React Query
  ├── Use the entire store without selectors — causes unnecessary re-renders
  ├── One mega-store for the whole app — split by domain
  ├── Mutate state directly (state.items.push(x)) without immer middleware
  ├── Access store outside React without getState() (useStore.getState())
  ├── Derive state that could be computed — compute in selectors
  └── console.log in store actions
```

---

## Zustand Verification Checklist

- [ ] One store per domain — no mega-stores
- [ ] Client state only — server data in React Query
- [ ] Typed with TypeScript interfaces
- [ ] Selectors used — no full-store subscriptions
- [ ] useShallow for multi-value selections
- [ ] Actions defined inside create()
- [ ] persist middleware configured with name and version
- [ ] devtools enabled in development
- [ ] No direct state mutation without immer
- [ ] No console.log in store code
