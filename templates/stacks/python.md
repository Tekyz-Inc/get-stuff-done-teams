# Python Standards

These rules are MANDATORY. Violations fail the task. No exceptions.

---

## 1. Type Hints

```
MANDATORY:
  ├── Type hints on ALL function signatures (params + return)
  ├── Use built-in generics (list, dict, tuple) — not typing.List etc. (Python 3.9+)
  ├── Use | for unions — not typing.Union (Python 3.10+)
  ├── Use dataclasses or Pydantic models for structured data — NEVER raw dicts
  └── Run mypy or pyright in CI — no untyped public functions
```

**BAD**
```python
def get_users(filters):
    result = {"users": [], "total": 0}
    return result
```

**GOOD**
```python
@dataclass
class UserList:
    users: list[User]
    total: int

def get_users(filters: UserFilters) -> UserList:
    ...
```

---

## 2. Project Structure

```
MANDATORY:
  ├── Use src/ layout for packages — src/{package_name}/
  ├── Tests mirror source: tests/{module}/test_{file}.py
  ├── One class per file for major classes — small helpers can share
  ├── __init__.py exports only the public API
  └── Config in environment variables or .env — NEVER hardcoded
```

---

## 3. Data Models

```
MANDATORY:
  ├── Use dataclasses for internal data structures
  ├── Use Pydantic BaseModel for API input/output and validation
  ├── Use Enums for fixed option sets — NEVER magic strings
  ├── Frozen dataclasses for immutable value objects
  └── NEVER pass raw dicts between functions — define a model
```

**BAD** — `def create_user(data: dict) -> dict:`

**GOOD**
```python
class CreateUserRequest(BaseModel):
    name: str = Field(min_length=2)
    email: EmailStr
    role: UserRole  # Enum

class UserResponse(BaseModel):
    id: str
    name: str
    email: str
    role: UserRole
    created_at: datetime

def create_user(request: CreateUserRequest) -> UserResponse:
    ...
```

---

## 4. Error Handling

```
MANDATORY:
  ├── Define custom exception hierarchy per domain — NEVER raise bare Exception
  ├── Catch specific exceptions — NEVER bare except: or except Exception:
  ├── Use try/except at boundaries (API handlers, CLI entry) — not deep in logic
  ├── Log exceptions with context (structlog or logging) before re-raising
  └── Return error types or raise — NEVER return None to signal failure
```

**BAD**
```python
try:
    result = do_something()
except:
    return None
```

**GOOD**
```python
class UserNotFoundError(DomainError):
    def __init__(self, user_id: str):
        super().__init__(f"User {user_id} not found")
        self.user_id = user_id

try:
    user = user_repo.get(user_id)
except UserNotFoundError:
    logger.warning("user_not_found", user_id=user_id)
    raise
```

---

## 5. Functions and Methods

```
MANDATORY:
  ├── Max 30 lines per function — split if longer
  ├── Max 200 lines per file — create new modules if needed
  ├── Single responsibility — one function does one thing
  ├── Use keyword arguments for functions with 3+ parameters
  ├── Default mutable arguments are FORBIDDEN — use None + factory
  └── Docstrings on public functions only — skip for obvious private methods
```

**BAD** — `def register(name, email, role, send_email=True, template=[], notify=[]):`

**GOOD**
```python
def register(
    *,
    name: str,
    email: str,
    role: UserRole,
    send_email: bool = True,
    template: list[str] | None = None,
    notify: list[str] | None = None,
) -> User:
    template = template or []
    notify = notify or []
    ...
```

---

## 6. Async Patterns

```
WHEN USING ASYNC:
  ├── async def for I/O-bound operations (HTTP, DB, file) — not CPU-bound
  ├── Use asyncio.gather for concurrent I/O — not sequential awaits
  ├── NEVER mix sync and async — use run_in_executor for sync libraries
  ├── Always set timeouts on external calls (httpx, aiohttp)
  └── Use async context managers for connections and sessions
```

**BAD** — sequential awaits for independent calls:
```python
users = await get_users()
orders = await get_orders()  # waits for users to finish first
```

**GOOD**
```python
users, orders = await asyncio.gather(get_users(), get_orders())
```

---

## 7. Testing

```
MANDATORY:
  ├── pytest as the test runner — not unittest
  ├── Use fixtures for setup/teardown — not setUp/tearDown methods
  ├── Use parametrize for testing multiple inputs
  ├── Test file naming: test_{module}.py
  ├── Test function naming: test_{behavior}_when_{condition}
  └── Assert with plain assert — not self.assertEqual
```

**GOOD**
```python
@pytest.fixture
def user_service(db_session: Session) -> UserService:
    return UserService(db_session)

@pytest.mark.parametrize("role,expected", [
    (UserRole.ADMIN, True),
    (UserRole.VIEWER, False),
])
def test_can_delete_when_role(user_service: UserService, role: UserRole, expected: bool):
    assert user_service.can_delete(role) == expected
```

---

## 8. Dependencies and Imports

```
MANDATORY:
  ├── Use virtual environments (venv, poetry, uv) — NEVER install globally
  ├── Pin dependencies in requirements.txt or pyproject.toml
  ├── Import order: stdlib → third-party → local (enforced by isort/ruff)
  ├── Use absolute imports for cross-module — relative for same-package
  └── NEVER import * — explicit imports only
```

---

## 9. Anti-Patterns

```
NEVER:
  ├── Bare except: or except Exception: without re-raise
  ├── Mutable default arguments (def f(items=[]))
  ├── Global mutable state — use dependency injection
  ├── String concatenation for SQL — use parameterized queries
  ├── print() for logging — use logging/structlog
  ├── Raw dicts as function params or return types
  ├── Nested functions deeper than 2 levels
  └── Type: ignore without explanation comment
```

---

## Python Verification Checklist

- [ ] Type hints on all function signatures
- [ ] Pydantic or dataclass for all structured data — no raw dicts
- [ ] Custom exceptions — no bare Exception raises
- [ ] Functions under 30 lines, files under 200 lines
- [ ] No mutable default arguments
- [ ] pytest with fixtures — no unittest patterns
- [ ] Import order enforced (stdlib → third-party → local)
- [ ] No print() in committed code — use logging
- [ ] Virtual environment with pinned dependencies
- [ ] No string-formatted SQL — parameterized queries only
