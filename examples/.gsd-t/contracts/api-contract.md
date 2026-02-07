# API Contract — Example

## POST /api/auth/login
- **Request**: `{ email: string, password: string }`
- **Response 200**: `{ token: string, user: { id: string, email: string, name: string } }`
- **Response 401**: `{ error: "Invalid credentials" }`
- **Owner**: auth domain
- **Consumers**: ui domain

## POST /api/auth/register
- **Request**: `{ email: string, password: string, name: string }`
- **Response 201**: `{ token: string, user: { id: string, email: string, name: string } }`
- **Response 400**: `{ error: "Email already registered" }`
- **Owner**: auth domain
- **Consumers**: ui domain

## GET /api/users/me
- **Headers**: `Authorization: Bearer {token}`
- **Response 200**: `{ id: string, email: string, name: string, created_at: string }`
- **Response 401**: `{ error: "Unauthorized" }`
- **Owner**: auth domain
- **Consumers**: ui domain
