# Domain: auth — Example

## Responsibility
Handles all authentication and authorization: user registration, login, JWT token generation and verification, password hashing, and auth middleware for protecting routes.

## Files Owned
- `src/auth/` — all auth service code
- `src/middleware/auth.py` — auth middleware
- `tests/auth/` — auth tests

## Inputs (from other domains)
- schema-contract.md: Users table structure for lookups

## Outputs (to other domains)
- api-contract.md: POST /api/auth/login, POST /api/auth/register, GET /api/users/me
