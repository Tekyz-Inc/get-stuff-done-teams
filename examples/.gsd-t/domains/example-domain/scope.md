# Domain: auth — Example

## Responsibility
Handles all authentication and authorization: user registration, login, JWT token generation and verification, password hashing, and auth middleware for protecting routes.

## Owned Files/Directories
- `src/auth/` — all auth service code
- `src/middleware/auth.py` — auth middleware
- `tests/auth/` — auth tests

## NOT Owned (do not modify)
- `src/db/` — owned by data-layer domain
- `src/api/` — owned by api domain (except auth endpoints)
