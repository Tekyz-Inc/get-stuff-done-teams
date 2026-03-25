# Security Standards (Universal — All Projects)

These rules are MANDATORY. Violations fail the task. No exceptions.

---

## 1. Input Validation & Sanitization

### All User Input
- **Validate at system boundaries** — every value from users, external APIs, URL params, form fields, file uploads
- **Whitelist, don't blacklist** — define what IS allowed, reject everything else
- **Validate type, length, format, and range** before processing
- **Trim and normalize** strings before validation (Unicode normalization, whitespace)

### SQL Injection Prevention
```
MANDATORY:
  ├── Use parameterized queries / prepared statements — ALWAYS
  ├── Never concatenate user input into SQL strings
  ├── ORM query builders are preferred over raw SQL
  └── If raw SQL is unavoidable, use the ORM's parameterized escape
```

### Command Injection Prevention
```
MANDATORY:
  ├── Never pass user input to shell commands (exec, spawn, system)
  ├── If shell execution is unavoidable, use allowlisted commands only
  ├── Use execFile (not exec) with explicit argument arrays
  └── Never construct commands with string interpolation from user data
```

---

## 2. Cross-Site Scripting (XSS)

### Output Encoding
- **Encode all dynamic output** before rendering in HTML, JavaScript, CSS, or URLs
- **Context-aware encoding** — HTML entities in HTML, JS escaping in script tags, URL encoding in URLs
- **Never trust data from any source** — even your own database (it may contain previously-injected content)

### DOM Manipulation
```
MANDATORY:
  ├── Never use innerHTML, outerHTML, or document.write with user data
  ├── Use textContent or innerText for text insertion
  ├── If HTML rendering is required, sanitize with DOMPurify first
  │     ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'ul', 'ol', 'li', 'a', 'b', 'i', 'u']
  │     ALLOWED_ATTR: ['href'] (on <a> only, with URL validation)
  ├── React: never use dangerouslySetInnerHTML without DOMPurify
  └── Vue: never use v-html without DOMPurify
```

### Content Security Policy
- Set `Content-Security-Policy` headers on all responses
- Minimum: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'`
- Never allow `'unsafe-eval'` in production

---

## 3. Authentication & Session Management

### Token Handling
```
MANDATORY:
  ├── Never store auth tokens in localStorage or sessionStorage
  │     (accessible to any XSS attack — game over)
  ├── Use httpOnly, Secure, SameSite cookies for session tokens
  ├── For SPAs: store tokens in memory (React Context, closure)
  │     Accept that page refresh = re-authenticate
  ├── Access tokens: short-lived (15 min max)
  ├── Refresh tokens: httpOnly cookie only, rotate on use
  └── Never include tokens in URLs or query parameters
```

### Password Handling
- **Never store plaintext passwords** — use bcrypt, scrypt, or Argon2
- **Minimum 12 character requirement** — no maximum length restriction
- **Never log passwords** — not even hashed ones
- **Rate limit login attempts** — 5 failures → progressive delay or lockout

### Session Security
- Regenerate session ID after authentication
- Set session timeout (idle: 30 min, absolute: 8 hours)
- Invalidate all sessions on password change

---

## 4. API Security

### Request Validation
```
MANDATORY:
  ├── Validate Content-Type header matches expected format
  ├── Validate request body against a schema (Zod, Joi, JSON Schema)
  ├── Reject requests with unexpected fields (additionalProperties: false)
  ├── Set maximum request body size (default: 1MB)
  └── Rate limit all endpoints (default: 100 req/min per IP for APIs)
```

### Response Security
- Never include stack traces or internal error details in production responses
- Use generic error messages for auth failures ("Invalid credentials" — don't reveal which field failed)
- Set security headers on all responses:
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `Strict-Transport-Security: max-age=31536000; includeSubDomains`
  - `X-XSS-Protection: 0` (rely on CSP instead)

### CORS
- Never use `Access-Control-Allow-Origin: *` on authenticated endpoints
- Whitelist specific origins
- Never reflect the Origin header as the CORS origin without validation

---

## 5. Secrets Management

```
MANDATORY:
  ├── Never hardcode secrets in source code (API keys, passwords, tokens)
  ├── Never commit .env files with real secrets
  ├── Use environment variables for all secrets
  ├── Never log secrets — redact in all log outputs
  ├── Never include secrets in frontend/client-side code
  │     (all client code is visible to users)
  ├── Never include secrets in error messages or stack traces
  └── Rotate secrets regularly and on any suspected compromise
```

### .gitignore Requirements
These files must ALWAYS be in `.gitignore`:
- `.env`, `.env.local`, `.env.*.local`
- `*.pem`, `*.key`, `*.cert`
- `credentials.json`, `service-account.json`
- `*.sqlite`, `*.db` (local databases)

---

## 6. AI-Specific Security (LLM / Prompt Injection)

### Prompt Injection Prevention
```
MANDATORY when user input feeds into LLM calls:
  ├── Never concatenate user input directly into system prompts
  ├── Use structured message format: system message (trusted) + user message (untrusted)
  ├── Validate and sanitize user input before including in any prompt
  ├── Strip or escape control sequences (markdown, XML tags, instruction-like text)
  ├── Set output length limits to prevent extraction attacks
  ├── Log and monitor prompt inputs for injection attempts
  └── Never allow user input to modify system instructions or tool definitions
```

### LLM Output Handling
- **Never trust LLM output** — treat it as untrusted input
- Validate LLM-generated code before execution
- Sanitize LLM-generated HTML/markdown before rendering
- Never execute LLM-suggested shell commands without validation
- If LLM output feeds into database queries, use parameterized queries

### Sensitive Data in Prompts
- Never include PII, passwords, or API keys in LLM prompts
- Redact sensitive fields before sending to external LLM APIs
- Be aware that LLM API providers may log prompts — treat all prompt content as potentially logged

---

## 7. File Upload Security

```
MANDATORY when handling file uploads:
  ├── Validate file type by content (magic bytes), not just extension
  ├── Set maximum file size limits
  ├── Generate random filenames — never use the original filename in storage
  ├── Store uploads outside the web root
  ├── Scan for malware before processing
  ├── Never execute or interpret uploaded files
  └── Set Content-Disposition: attachment on file downloads
```

---

## 8. Dependency Security

- **Audit dependencies regularly** — `npm audit`, `pip audit`, `go mod verify`
- **Pin dependency versions** — use lockfiles (package-lock.json, poetry.lock)
- **Never install packages from untrusted sources**
- **Review dependency licenses** for compatibility
- **Monitor for CVEs** in production dependencies

---

## 9. Logging & Error Handling

### What to Log
- Authentication events (login, logout, failed attempts)
- Authorization failures (access denied)
- Input validation failures
- Application errors and exceptions
- Security-relevant events (rate limiting, CORS rejections)

### What NEVER to Log
- Passwords (even hashed)
- Session tokens or API keys
- Full credit card numbers
- Social security numbers or government IDs
- Personal health information
- Any data subject to PII regulations

### Error Handling
- Never expose stack traces to users in production
- Use structured error responses with error codes
- Log the full error server-side, return a sanitized version to the client
- Never catch and swallow errors silently — log them at minimum

---

## 10. External Links

```
MANDATORY:
  ├── All external links: target="_blank" rel="noopener noreferrer"
  ├── Validate URLs before redirecting (prevent open redirect attacks)
  ├── Never redirect to user-supplied URLs without validation
  └── Whitelist allowed redirect domains
```

---

## Pre-Commit Security Checklist

Before committing code that handles user input, authentication, or external data:

- [ ] No hardcoded secrets in source code
- [ ] User input validated and sanitized at system boundaries
- [ ] SQL queries use parameterized statements
- [ ] No `innerHTML` / `dangerouslySetInnerHTML` without sanitization
- [ ] Auth tokens not stored in localStorage
- [ ] Error responses don't expose internal details
- [ ] External links use `rel="noopener noreferrer"`
- [ ] File uploads validated by content type and size
- [ ] Sensitive data not logged
- [ ] If LLM-integrated: prompt injection prevention in place
