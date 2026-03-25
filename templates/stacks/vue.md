# Vue Standards

These rules are MANDATORY. Violations fail the task. No exceptions.

---

## 1. Composition API

```
MANDATORY:
  ├── Use <script setup> (Composition API) — NEVER Options API for new code
  ├── Use ref() for primitives, reactive() for objects
  ├── Use computed() for derived values — NEVER store derived data in ref
  ├── Use composables (useXxx) for reusable logic — extract from components
  └── NEVER use this. — Composition API doesn't use it
```

**BAD** — Options API:
```vue
<script>
export default {
  data() { return { count: 0 }; },
  methods: { increment() { this.count++; } },
};
</script>
```

**GOOD** — Composition API:
```vue
<script setup lang="ts">
import { ref } from 'vue';
const count = ref(0);
const increment = () => count.value++;
</script>
```

---

## 2. State Management — Pinia

```
MANDATORY:
  ├── Pinia for global state — not Vuex
  ├── One store per domain (useUserStore, useCartStore)
  ├── Use Setup Stores syntax (function-based) — matches Composition API
  ├── Server data: prefer VueQuery (@tanstack/vue-query) — not Pinia
  └── NEVER mutate store state directly from components — use actions
```

**GOOD**
```typescript
export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null);
  const isLoggedIn = computed(() => !!user.value);

  async function login(credentials: LoginCredentials) {
    user.value = await authService.login(credentials);
  }

  function logout() {
    user.value = null;
  }

  return { user, isLoggedIn, login, logout };
});
```

---

## 3. Component Design

```
MANDATORY:
  ├── Max 150 lines per SFC — extract sub-components
  ├── <script setup> → <template> → <style scoped> order
  ├── One component per .vue file
  ├── Props: use defineProps with TypeScript interface
  ├── Emits: use defineEmits with TypeScript
  ├── Use v-bind shorthand (:prop) and v-on shorthand (@event)
  └── No business logic in templates — compute in <script setup>
```

**GOOD**
```vue
<script setup lang="ts">
interface Props {
  title: string;
  variant?: 'primary' | 'secondary';
}
const props = withDefaults(defineProps<Props>(), {
  variant: 'primary',
});
const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'submit', data: FormData): void;
}>();
</script>
```

---

## 4. Routing — Vue Router

```
MANDATORY:
  ├── Centralized route definitions in router/index.ts
  ├── Lazy load route components — () => import('./views/XxxView.vue')
  ├── Use named routes for navigation — NEVER hardcode paths in components
  ├── Navigation guards for auth in router.beforeEach — not in components
  ├── Type route params with defineProps or useRoute().params
  └── Always have a catch-all 404 route: { path: '/:pathMatch(.*)*' }
```

---

## 5. Template Rules

```
MANDATORY:
  ├── v-if over v-show for rarely toggled content (v-show for frequent toggles)
  ├── NEVER use v-if and v-for on the same element — wrap in <template v-if>
  ├── Use :key on all v-for — stable unique IDs, not array index
  ├── Emit events up, pass props down — NEVER mutate props
  ├── Use <slot> for composable component APIs — not excessive props
  └── Use <Teleport> for modals/toasts — not DOM hacks
```

**BAD** — v-if + v-for on same element:
```vue
<li v-for="user in users" v-if="user.active" :key="user.id">
```

**GOOD**
```vue
<template v-for="user in users" :key="user.id">
  <li v-if="user.active">{{ user.name }}</li>
</template>
```

Or better — use a computed:
```typescript
const activeUsers = computed(() => users.value.filter(u => u.active));
```

---

## 6. Composables (Custom Hooks)

```
MANDATORY:
  ├── Name: useXxx (useAuth, useUsers, useDebounce)
  ├── File location: composables/ directory
  ├── Return reactive refs and functions — consumers decide how to use them
  ├── Handle cleanup in onUnmounted — don't leak timers or listeners
  └── One concern per composable
```

---

## 7. Anti-Patterns

```
NEVER:
  ├── Options API in new code (use Composition API + <script setup>)
  ├── Vuex in new code (use Pinia)
  ├── v-if + v-for on the same element
  ├── Mutating props — emit events instead
  ├── $refs for parent-child communication — use props/emits
  ├── Direct DOM manipulation (document.querySelector) — use template refs
  ├── Watchers for derived data — use computed()
  ├── console.log in committed code
  └── this. in <script setup> — it doesn't exist
```

---

## Vue Verification Checklist

- [ ] Composition API with `<script setup>` — no Options API
- [ ] Pinia for global state — no Vuex
- [ ] VueQuery for server data (if applicable)
- [ ] Props defined with TypeScript interfaces via defineProps
- [ ] Emits defined with TypeScript via defineEmits
- [ ] Components under 150 lines
- [ ] Route components lazy loaded
- [ ] No v-if + v-for on same element
- [ ] Stable :key on all v-for — no array index
- [ ] Auth handled in router guards — not components
- [ ] No console.log in committed code
