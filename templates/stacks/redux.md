# Redux Toolkit Standards

These rules are MANDATORY. Violations fail the task. No exceptions.

---

## 1. RTK Only — No Legacy Redux

```
MANDATORY:
  ├── Use @reduxjs/toolkit (RTK) — NEVER raw redux with manual action creators/reducers
  ├── Use createSlice for all state slices
  ├── Use configureStore — NEVER createStore
  ├── Use RTK Query for server data — NEVER manual async thunks for API calls
  └── Use TypeScript with typed hooks (useAppSelector, useAppDispatch)
```

---

## 2. Slice Design

```
MANDATORY:
  ├── One slice per domain: userSlice, cartSlice, uiSlice
  ├── Name slices clearly: name: 'auth', name: 'cart'
  ├── Define state interface with TypeScript
  ├── Reducers handle one concern — keep them focused
  ├── Use prepare callbacks for action payload shaping
  └── Export actions and reducer separately
```

**GOOD**
```typescript
interface AuthState {
  user: User | null;
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
}

const initialState: AuthState = {
  user: null,
  status: 'idle',
  error: null,
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setUser: (state, action: PayloadAction<User>) => {
      state.user = action.payload;
      state.status = 'succeeded';
    },
    logout: (state) => {
      state.user = null;
      state.status = 'idle';
    },
  },
});

export const { setUser, logout } = authSlice.actions;
export default authSlice.reducer;
```

---

## 3. RTK Query — Server Data

```
MANDATORY:
  ├── Use RTK Query for ALL API calls — NEVER createAsyncThunk for data fetching
  ├── Define one API slice per backend service
  ├── Use tag-based cache invalidation — not manual cache updates
  ├── Type all endpoints with request/response types
  ├── Handle loading, error, and empty states using hook results
  └── Set keepUnusedDataFor to control cache lifetime
```

**GOOD**
```typescript
export const usersApi = createApi({
  reducerPath: 'usersApi',
  baseQuery: fetchBaseQuery({ baseUrl: '/api/v1' }),
  tagTypes: ['User'],
  endpoints: (builder) => ({
    getUsers: builder.query<User[], UserFilters>({
      query: (filters) => ({ url: '/users', params: filters }),
      providesTags: ['User'],
    }),
    getUser: builder.query<User, string>({
      query: (id) => `/users/${id}`,
      providesTags: (result, error, id) => [{ type: 'User', id }],
    }),
    createUser: builder.mutation<User, CreateUserInput>({
      query: (body) => ({ url: '/users', method: 'POST', body }),
      invalidatesTags: ['User'],
    }),
  }),
});

export const { useGetUsersQuery, useGetUserQuery, useCreateUserMutation } = usersApi;
```

---

## 4. Store Configuration

```
MANDATORY:
  ├── configureStore with typed RootState and AppDispatch
  ├── Add RTK Query middleware for cache management
  ├── Create typed hooks: useAppSelector, useAppDispatch
  ├── Redux DevTools enabled by default in development
  └── Keep store configuration in a single store.ts file
```

**GOOD**
```typescript
// store.ts
export const store = configureStore({
  reducer: {
    auth: authReducer,
    cart: cartReducer,
    [usersApi.reducerPath]: usersApi.reducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(usersApi.middleware),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

// hooks.ts
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
export const useAppDispatch: () => AppDispatch = useDispatch;
```

---

## 5. Selectors

```
MANDATORY:
  ├── Use createSelector (reselect) for derived/computed state
  ├── Select minimal state — NEVER select the entire slice
  ├── Co-locate selectors with their slice file
  ├── Name selectors: select{Thing} (selectActiveUsers, selectCartTotal)
  └── Memoized selectors for filtered/sorted/computed data
```

**GOOD**
```typescript
// In authSlice.ts
export const selectUser = (state: RootState) => state.auth.user;
export const selectIsAuthenticated = (state: RootState) => !!state.auth.user;

// Memoized computed selector
export const selectActiveUsers = createSelector(
  [(state: RootState) => state.users.list],
  (users) => users.filter(u => u.isActive)
);
```

---

## 6. Anti-Patterns

```
NEVER:
  ├── Raw redux (createStore, manual action types, switch reducers)
  ├── createAsyncThunk for API calls — use RTK Query
  ├── Selecting entire slice in a component
  ├── Storing server data in slices — use RTK Query
  ├── Mutating state outside of createSlice reducers (Immer only works inside)
  ├── String action types — use createSlice auto-generated types
  ├── Dispatching in useEffect for data fetching — use RTK Query hooks
  └── console.log in reducers
```

---

## Redux Toolkit Verification Checklist

- [ ] RTK only — no legacy redux patterns
- [ ] createSlice for all state management
- [ ] RTK Query for all API calls — no createAsyncThunk for fetching
- [ ] Tag-based cache invalidation on mutations
- [ ] Typed store (RootState, AppDispatch, typed hooks)
- [ ] Selectors with createSelector for computed state
- [ ] Minimal state selected — no full-slice subscriptions
- [ ] Store configured with RTK Query middleware
- [ ] Loading, error, empty states handled via hook results
- [ ] No console.log in reducers or slices
