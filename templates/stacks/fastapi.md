# FastAPI Standards (When FastAPI Detected)

These rules are MANDATORY. Violations fail the task. No exceptions.
Applies when `fastapi` is in `requirements.txt` or `pyproject.toml`.

---

## 1. App Structure

```
MANDATORY:
  ├── Use factory pattern: create_app() function that returns FastAPI instance
  ├── Register routers via app.include_router() — not inline route definitions
  ├── Use lifespan context manager for startup/shutdown (NOT @app.on_event — deprecated)
  ├── Group routes into routers by domain: routers/users.py, routers/orders.py
  ├── One router per file — NEVER a single routes.py with everything
  └── Entry point: main.py or app.py calls create_app() — uvicorn points here
```

**GOOD**
```python
from contextlib import asynccontextmanager
from fastapi import FastAPI

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: init DB pool, cache, etc.
    await db.connect()
    yield
    # Shutdown: clean up
    await db.disconnect()

def create_app() -> FastAPI:
    app = FastAPI(title="MyAPI", lifespan=lifespan)
    app.include_router(users_router, prefix="/users", tags=["users"])
    app.include_router(orders_router, prefix="/orders", tags=["orders"])
    return app
```

**BAD** — deprecated on_event:
```python
@app.on_event("startup")  # DEPRECATED — use lifespan instead
async def startup():
    await db.connect()
```

---

## 2. Dependency Injection

```
MANDATORY:
  ├── Use Depends() for all shared logic: auth, DB sessions, config, pagination
  ├── Dependencies return values — NEVER modify request state as a side effect
  ├── Chain dependencies: get_current_user depends on get_token depends on get_header
  ├── Use yield dependencies for resource cleanup (DB sessions, file handles)
  ├── Type-hint dependency return values — FastAPI uses them for OpenAPI docs
  └── NEVER import and call services directly in route handlers — inject them
```

**GOOD**
```python
from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with async_session() as session:
        yield session

async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    user = await authenticate(token, db)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid token")
    return user

@router.get("/me")
async def read_current_user(user: User = Depends(get_current_user)):
    return user
```

**BAD** — no DI, direct imports:
```python
@router.get("/me")
async def read_current_user(request: Request):
    db = get_database_connection()  # Manual — not injectable, not testable
    token = request.headers.get("Authorization")
    user = authenticate(token, db)
```

---

## 3. Request/Response Models (Pydantic)

```
MANDATORY:
  ├── Every endpoint has explicit request AND response models — no raw dicts
  ├── Use separate models: UserCreate (input), UserResponse (output), UserInDB (internal)
  ├── Response models NEVER expose internal fields (hashed_password, internal IDs)
  ├── Use response_model parameter on route decorator — not manual dict construction
  ├── Validate with Field(): min/max length, regex, ge/le for numbers
  ├── Use model_config with from_attributes=True for ORM compatibility (Pydantic v2)
  └── NEVER use dict() or **kwargs to build responses — use response models
```

**GOOD**
```python
from pydantic import BaseModel, Field, EmailStr

class UserCreate(BaseModel):
    email: EmailStr
    name: str = Field(min_length=1, max_length=100)

class UserResponse(BaseModel):
    id: int
    email: EmailStr
    name: str
    model_config = {"from_attributes": True}

@router.post("/users", response_model=UserResponse, status_code=201)
async def create_user(body: UserCreate, db: AsyncSession = Depends(get_db)):
    user = await user_service.create(db, body)
    return user  # Pydantic filters fields automatically via response_model
```

---

## 4. Error Handling

```
MANDATORY:
  ├── Use HTTPException for expected errors (404, 409, 422)
  ├── Create custom exception classes for domain errors — map to HTTP in handlers
  ├── Register exception_handler() for custom exceptions — don't catch-and-reraise everywhere
  ├── Return consistent error shape: { "detail": "message" } or { "detail": [{ "loc": [...], "msg": "..." }] }
  ├── NEVER return 500 for recoverable errors — map to appropriate 4xx
  ├── NEVER expose stack traces in production — configure exception handlers
  └── Let FastAPI's built-in RequestValidationError handle 422s — don't override unless adding context
```

**GOOD**
```python
class NotFoundError(Exception):
    def __init__(self, resource: str, id: Any):
        self.resource = resource
        self.id = id

@app.exception_handler(NotFoundError)
async def not_found_handler(request: Request, exc: NotFoundError):
    return JSONResponse(
        status_code=404,
        content={"detail": f"{exc.resource} {exc.id} not found"},
    )
```

---

## 5. Async Patterns

```
MANDATORY:
  ├── Use async def for ALL route handlers — even if they don't await anything
  ├── Use async DB drivers: asyncpg (PostgreSQL), aiosqlite, motor (MongoDB)
  ├── NEVER call synchronous blocking functions inside async handlers
  │     ├── Blocking I/O (file reads, subprocess) → use run_in_executor or anyio.to_thread
  │     └── CPU-bound work → use BackgroundTasks or a task queue
  ├── Use asyncio.gather() for concurrent independent operations
  ├── NEVER use time.sleep() — use asyncio.sleep()
  └── Connection pools: configure pool_size and max_overflow for async engines
```

**GOOD** — concurrent operations:
```python
@router.get("/dashboard")
async def get_dashboard(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    stats, notifications, recent = await asyncio.gather(
        get_user_stats(db, user.id),
        get_notifications(db, user.id),
        get_recent_activity(db, user.id),
    )
    return {"stats": stats, "notifications": notifications, "recent": recent}
```

---

## 6. Background Tasks

```
MANDATORY:
  ├── Use BackgroundTasks for fire-and-forget work (emails, logging, cleanup)
  ├── BackgroundTasks run AFTER the response is sent — don't use for things the client needs
  ├── For long-running or critical work → use a proper task queue (Celery, ARQ, dramatiq)
  ├── Background tasks share the same process — don't block the event loop
  └── NEVER use BackgroundTasks for anything that must complete reliably (payments, data sync)
```

**GOOD**
```python
@router.post("/users", response_model=UserResponse, status_code=201)
async def create_user(
    body: UserCreate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    user = await user_service.create(db, body)
    background_tasks.add_task(send_welcome_email, user.email)
    return user
```

---

## 7. Middleware

```
MANDATORY:
  ├── Use @app.middleware("http") for cross-cutting concerns (timing, request IDs, CORS)
  ├── Add CORSMiddleware with explicit allow_origins — NEVER use allow_origins=["*"] in production
  ├── Add request ID middleware: generate UUID per request, include in response headers and logs
  ├── Order matters: middleware runs top-to-bottom on request, bottom-to-top on response
  ├── NEVER do heavy computation in middleware — it runs on every request
  └── Use middleware for observability (timing, logging), not business logic
```

**GOOD**
```python
import uuid

@app.middleware("http")
async def add_request_id(request: Request, call_next):
    request_id = str(uuid.uuid4())
    request.state.request_id = request_id
    response = await call_next(request)
    response.headers["X-Request-ID"] = request_id
    return response

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,  # Explicit list from env
    allow_methods=["*"],
    allow_headers=["*"],
)
```

---

## 8. Configuration

```
MANDATORY:
  ├── Use pydantic-settings (BaseSettings) for all configuration
  ├── Load from environment variables — NEVER hardcode secrets or URLs
  ├── Use .env files for local dev only — NEVER commit .env files
  ├── Type-validate all config at startup — fail fast on missing/invalid values
  ├── Use @lru_cache on get_settings() to avoid re-parsing on every request
  └── Group settings: DatabaseSettings, AuthSettings, AppSettings
```

**GOOD**
```python
from pydantic_settings import BaseSettings
from functools import lru_cache

class Settings(BaseSettings):
    database_url: str
    jwt_secret: str
    cors_origins: list[str] = ["http://localhost:3000"]
    debug: bool = False

    model_config = {"env_file": ".env"}

@lru_cache
def get_settings() -> Settings:
    return Settings()
```

---

## 9. Testing

```
MANDATORY:
  ├── Use httpx.AsyncClient with ASGITransport — NOT TestClient for async tests
  ├── Override dependencies in tests: app.dependency_overrides[get_db] = mock_db
  ├── Use pytest-asyncio for async test functions
  ├── Each test gets a fresh database transaction — rollback after each test
  ├── Test response status codes AND response body shapes
  ├── Test validation: send invalid input, verify 422 with correct error messages
  └── NEVER test against a shared/production database
```

**GOOD**
```python
import pytest
from httpx import ASGITransport, AsyncClient

@pytest.fixture
async def client(test_db):
    app.dependency_overrides[get_db] = lambda: test_db
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()

@pytest.mark.asyncio
async def test_create_user(client: AsyncClient):
    response = await client.post("/users", json={"email": "test@example.com", "name": "Test"})
    assert response.status_code == 201
    data = response.json()
    assert data["email"] == "test@example.com"
    assert "id" in data
    assert "hashed_password" not in data  # Never exposed
```

---

## 10. OpenAPI / Swagger

```
MANDATORY:
  ├── FastAPI auto-generates OpenAPI — leverage it, don't fight it
  ├── Add summary and description to every route via docstrings or parameters
  ├── Use tags to group endpoints in Swagger UI
  ├── Use response_model for success AND responses={} for error shapes
  ├── Serve docs at /docs (Swagger UI) and /redoc (ReDoc) — disable in production if needed
  └── NEVER manually write OpenAPI YAML — let FastAPI generate from code
```

**GOOD**
```python
@router.post(
    "/users",
    response_model=UserResponse,
    status_code=201,
    summary="Create a new user",
    responses={
        409: {"description": "Email already registered"},
        422: {"description": "Validation error"},
    },
)
async def create_user(body: UserCreate, db: AsyncSession = Depends(get_db)):
    """Create a user account. Sends a welcome email after creation."""
    ...
```

---

## 11. Anti-Patterns

```
NEVER:
  ├── @app.on_event("startup"/"shutdown") — use lifespan context manager
  ├── Synchronous DB drivers (psycopg2, sqlite3) in async handlers — use async drivers
  ├── Raw dict returns without response_model — no type safety, no field filtering
  ├── Business logic in route handlers — extract to service layer
  ├── Global mutable state (module-level dicts/lists) — use dependency injection
  ├── Catching Exception broadly in handlers — let FastAPI's error handling work
  ├── time.sleep() in async code — blocks the event loop
  ├── TestClient for async tests — use httpx.AsyncClient with ASGITransport
  └── allow_origins=["*"] in production CORS config
```

---

## FastAPI Verification Checklist

- [ ] Factory pattern with lifespan context manager (not on_event)
- [ ] All shared logic injected via Depends()
- [ ] Separate Pydantic models for input, output, and internal use
- [ ] No internal fields exposed in response models
- [ ] Custom exceptions with registered handlers
- [ ] All handlers are async def with async I/O
- [ ] BackgroundTasks for fire-and-forget, task queue for critical work
- [ ] Configuration via pydantic-settings with env vars
- [ ] Tests use httpx.AsyncClient, not TestClient
- [ ] OpenAPI docs auto-generated with summaries and error responses
- [ ] CORS configured with explicit origins
