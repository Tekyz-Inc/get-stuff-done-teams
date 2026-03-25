# Flutter Standards

These rules are MANDATORY. Violations fail the task. No exceptions.

---

## 1. State Management — Riverpod

```
MANDATORY:
  ├── Use Riverpod for state management — not setState for anything beyond local UI
  ├── Provider for each data source (API, local storage, computed)
  ├── AsyncNotifierProvider for server data with loading/error states
  ├── StateProvider for simple toggles/filters
  ├── NEVER store server data in StatefulWidget setState
  └── ref.watch for reactive reads, ref.read for one-shot actions (onTap)
```

**BAD**
```dart
class _MyState extends State<MyWidget> {
  List<User> users = [];
  void initState() {
    super.initState();
    fetchUsers().then((u) => setState(() => users = u));
  }
}
```

**GOOD**
```dart
@riverpod
class UsersNotifier extends _$UsersNotifier {
  @override
  Future<List<User>> build() => userRepository.getAll();
}

// In widget:
final users = ref.watch(usersNotifierProvider);
users.when(
  data: (list) => UserListView(users: list),
  loading: () => const LoadingSkeleton(),
  error: (e, _) => ErrorView(message: e.toString()),
);
```

---

## 2. Widget Design

```
MANDATORY:
  ├── Max 150 lines per widget file — extract sub-widgets
  ├── Prefer StatelessWidget — use ConsumerWidget with Riverpod
  ├── Extract build method sub-trees into separate widgets (not methods)
  ├── One widget per file for major widgets
  ├── Use const constructors wherever possible
  └── No business logic in build() — move to providers/notifiers
```

**BAD** — `Widget _buildHeader()` methods that return widget trees.

**GOOD** — Extract `HeaderWidget` as its own `ConsumerWidget`.

---

## 3. Navigation

```
MANDATORY:
  ├── Use go_router for declarative routing
  ├── Define all routes in a single router config file
  ├── Use named routes — NEVER hardcode path strings in widgets
  ├── Handle deep links in the router config
  └── Redirect unauthenticated users in router guards — not in widgets
```

**GOOD**
```dart
final router = GoRouter(
  routes: [
    GoRoute(path: '/', builder: (_, __) => const HomePage()),
    GoRoute(path: '/users/:id', builder: (_, state) =>
      UserDetailPage(id: state.pathParameters['id']!)),
  ],
  redirect: (context, state) {
    final isLoggedIn = ref.read(authProvider).isLoggedIn;
    if (!isLoggedIn) return '/login';
    return null;
  },
);
```

---

## 4. Data Models

```
MANDATORY:
  ├── Use freezed for immutable data classes with copyWith, ==, and serialization
  ├── JSON serialization via json_serializable or freezed's fromJson/toJson
  ├── NEVER use raw Map<String, dynamic> between layers
  ├── Separate models: API DTO → Domain Model → UI ViewModel (if needed)
  └── Use sealed classes (Dart 3) for state unions
```

**GOOD**
```dart
@freezed
class User with _$User {
  const factory User({
    required String id,
    required String name,
    required String email,
    required UserRole role,
  }) = _User;

  factory User.fromJson(Map<String, dynamic> json) => _$UserFromJson(json);
}
```

---

## 5. Repository Pattern

```
MANDATORY:
  ├── All API/DB calls go through repository classes — widgets never call HTTP directly
  ├── Repository returns domain models — not raw JSON or Response objects
  ├── Handle errors in repository — throw typed exceptions
  ├── Abstract repository interface for testability
  └── Use dio or http package — configure interceptors for auth/logging
```

---

## 6. Platform-Specific Code

```
MANDATORY:
  ├── Use Platform.isAndroid/isIOS checks sparingly — prefer adaptive widgets
  ├── Platform channels: define a clear Dart interface, handle errors on both sides
  ├── Test on both platforms before marking task complete
  ├── Use device_info_plus for runtime capability detection
  └── Handle permissions gracefully — explain why before requesting
```

---

## 7. Performance

```
MANDATORY:
  ├── Use const widgets wherever possible — prevents unnecessary rebuilds
  ├── Use ListView.builder for long lists — NEVER ListView with children for 20+ items
  ├── Cache images with CachedNetworkImage — not Image.network
  ├── Avoid rebuilding entire widget trees — use granular providers
  ├── Profile with Flutter DevTools before optimizing
  └── Minimize widget depth — deep nesting kills readability and performance
```

---

## 8. Testing

```
MANDATORY:
  ├── Unit tests for providers, notifiers, and business logic
  ├── Widget tests for UI components with pumpWidget
  ├── Integration tests for critical user flows
  ├── Use mocktail for mocking — not mockito (null-safety friendly)
  ├── Test loading, error, and empty states — not just happy path
  └── Golden tests for complex custom widgets (optional but recommended)
```

---

## 9. Anti-Patterns

```
NEVER:
  ├── setState for server data (use Riverpod)
  ├── Raw Map<String, dynamic> between layers — use typed models
  ├── Build methods over 80 lines — extract widgets
  ├── Hardcoded strings — use constants or l10n
  ├── Nested callbacks deeper than 2 levels — use async/await
  ├── context.read in build() — use ref.watch
  ├── Ignoring dispose() — always clean up controllers and streams
  └── print() for logging — use logger package
```

---

## Flutter Verification Checklist

- [ ] Riverpod for state management — no setState for server data
- [ ] Widgets under 150 lines with const constructors
- [ ] go_router with named routes — no hardcoded path strings
- [ ] freezed models for all data — no raw Maps
- [ ] Repository pattern — widgets never call HTTP
- [ ] Loading, error, and empty states handled in every async widget
- [ ] ListView.builder for dynamic lists
- [ ] Tests cover providers, widgets, and critical flows
- [ ] Tested on both iOS and Android
- [ ] No print() in committed code
