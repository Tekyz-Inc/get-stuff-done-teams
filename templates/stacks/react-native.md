# React Native Standards

These rules are MANDATORY. Violations fail the task. No exceptions.

---

## 1. State Management — React Query + Zustand

```
MANDATORY:
  ├── React Query (TanStack Query) for ALL server data — NEVER useEffect + fetch
  ├── Zustand for client-side global state (auth, theme, navigation state)
  ├── useState for local UI state only (toggles, form inputs)
  ├── NEVER store server data in useState or Zustand — it belongs in the query cache
  └── Set staleTime explicitly on all queries
```

**GOOD**
```tsx
// Server data → React Query
const { data: users } = useQuery({
  queryKey: ['users'],
  queryFn: api.getUsers,
  staleTime: 5 * 60 * 1000,
});

// Client state → Zustand
const useAuthStore = create<AuthState>((set) => ({
  token: null,
  setToken: (token) => set({ token }),
  logout: () => set({ token: null }),
}));
```

---

## 2. Component Design

```
MANDATORY:
  ├── Max 150 lines per component — extract sub-components
  ├── Use FlatList for all dynamic lists — NEVER ScrollView with .map()
  ├── Separate screen components (screens/) from reusable components (components/)
  ├── One component per file
  ├── No business logic in JSX — compute above the return
  └── Use custom hooks for complex logic (useXxx)
```

**BAD**
```tsx
<ScrollView>
  {items.map(item => <ItemRow key={item.id} item={item} />)}
</ScrollView>
```

**GOOD**
```tsx
<FlatList
  data={items}
  keyExtractor={(item) => item.id}
  renderItem={({ item }) => <ItemRow item={item} />}
  ListEmptyComponent={<EmptyState />}
/>
```

---

## 3. Navigation — React Navigation

```
MANDATORY:
  ├── Use React Navigation (not react-native-router-flux, not expo-router for bare RN)
  ├── Type all navigation params with RootStackParamList
  ├── Define all routes in a central navigation config
  ├── Deep linking config in the navigator — not hardcoded in components
  └── Handle auth flow with conditional navigator (logged in → app, else → auth)
```

**GOOD**
```tsx
type RootStackParamList = {
  Home: undefined;
  UserDetail: { userId: string };
  Settings: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

function AppNavigator() {
  const { isLoggedIn } = useAuth();
  return (
    <Stack.Navigator>
      {isLoggedIn ? (
        <>
          <Stack.Screen name="Home" component={HomeScreen} />
          <Stack.Screen name="UserDetail" component={UserDetailScreen} />
        </>
      ) : (
        <Stack.Screen name="Login" component={LoginScreen} />
      )}
    </Stack.Navigator>
  );
}
```

---

## 4. Styling

```
MANDATORY:
  ├── Use StyleSheet.create for all styles — NEVER inline style objects
  ├── Co-locate styles at the bottom of the component file
  ├── Use a theme object for colors, spacing, typography — NEVER hardcode
  ├── Responsive: use useWindowDimensions or percentage-based layouts
  └── Platform-specific styles via Platform.select or .ios.tsx/.android.tsx files
```

**BAD** — `<View style={{ padding: 16, backgroundColor: '#f5f5f5' }}>`

**GOOD**
```tsx
const styles = StyleSheet.create({
  container: {
    padding: theme.spacing.md,
    backgroundColor: theme.colors.surface,
  },
});
```

---

## 5. Performance

```
MANDATORY:
  ├── FlatList with keyExtractor — NEVER ScrollView for lists
  ├── Use React.memo on list item components
  ├── useCallback for renderItem and event handlers passed to FlatList
  ├── Avoid anonymous functions in props of list items
  ├── Use react-native-fast-image for image caching
  ├── Minimize bridge calls — batch state updates
  └── Profile with Flipper or React DevTools before optimizing
```

---

## 6. Platform Differences

```
MANDATORY:
  ├── Test on BOTH iOS and Android before marking complete
  ├── Use Platform.OS checks sparingly — prefer cross-platform components
  ├── Handle safe areas with SafeAreaView or useSafeAreaInsets
  ├── Handle keyboard: KeyboardAvoidingView (behavior differs per platform)
  ├── Permissions: request at point of use, explain why, handle denial gracefully
  └── Status bar: manage with StatusBar component — don't assume default
```

---

## 7. Offline and Networking

```
WHEN APPLICABLE:
  ├── React Query's built-in cache for offline reads
  ├── Use @react-native-community/netinfo for connectivity detection
  ├── Show offline indicator — don't silently fail
  ├── Queue mutations when offline, replay when online
  └── Set reasonable timeouts on all network requests
```

---

## 8. Error Handling

```
MANDATORY:
  ├── Global error boundary at the app root — never a blank crash screen
  ├── Per-screen error boundaries for isolated failures
  ├── Handle loading, error, and empty states for every data fetch
  ├── Crash reporting (Sentry, Bugsnag) in production builds
  └── User-friendly error messages — not raw error strings
```

---

## 9. Anti-Patterns

```
NEVER:
  ├── ScrollView with .map() for dynamic lists (use FlatList)
  ├── Inline style objects (use StyleSheet.create)
  ├── useEffect for data fetching (use React Query)
  ├── Hardcoded colors/spacing — use theme
  ├── console.log in committed code
  ├── Ignoring platform differences — test on both
  ├── Ignoring keyboard avoidance — forms become unusable
  └── Large images without caching — use FastImage
```

---

## React Native Verification Checklist

- [ ] React Query for server data — no useEffect + fetch
- [ ] FlatList for all dynamic lists — no ScrollView + map
- [ ] Components under 150 lines
- [ ] StyleSheet.create for all styles — no inline objects
- [ ] Theme object for colors/spacing — no hardcoded values
- [ ] React Navigation with typed params
- [ ] Loading, error, and empty states handled
- [ ] Tested on both iOS and Android
- [ ] Safe areas and keyboard avoidance handled
- [ ] No console.log in committed code
- [ ] Error boundaries at root and per-screen
