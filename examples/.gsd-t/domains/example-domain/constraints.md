# Constraints: auth — Example

## Patterns to Follow
- Use bcrypt for password hashing (never plain text or MD5)
- JWT tokens expire after 24 hours
- All auth endpoints return consistent error shapes per api-contract.md

## Must NOT
- Modify files outside src/auth/ and src/middleware/auth.py
- Store plain text passwords under any circumstances
- Return password hashes in API responses
- Access database directly — use data-layer service functions

## Dependencies
- PyJWT for token generation
- bcrypt for password hashing
- data-layer domain for user lookups
