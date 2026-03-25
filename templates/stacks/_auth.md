# Authentication Standards (Universal — All Projects)

These rules are MANDATORY. Violations fail the task. No exceptions.

---

## 1. Registration — Email-First, Password-Later

```
MANDATORY:
  ├── Signup collects email + app-specific fields only — NO password at registration
  ├── After signup, send a "set your password" email (same flow as forgot password)
  ├── The set-password link is a one-time, time-limited token (15-60 minutes)
  ├── User clicks link → lands on set-password page → sets their password → logged in
  ├── This eliminates: temporary passwords, forced password changes, password-in-transit risks
  └── If the link expires, user can request a new one (same as forgot password)
```

**Why one flow**: "Set password" and "Forgot password" are the same operation — generate a token, email a link, user sets a password. Building them as one flow halves the auth code and guarantees consistent behavior.

**GOOD**
```
1. User submits: { email, name, [app-specific fields] }
2. Server creates account (no password set, status: pending_verification)
3. Server sends email: "Welcome! Set your password: [link with token]"
4. User clicks link → set-password page
5. User sets password → account activated → logged in
6. If link expires → user clicks "Resend" → same flow
```

---

## 2. Provider Abstraction

```
MANDATORY:
  ├── Wrap the auth provider behind an AuthService interface
  ├── Application code NEVER calls Cognito/Firebase/Google/Supabase Auth directly
  ├── AuthService exposes: signup, login, logout, resetPassword, refreshToken, getCurrentUser
  ├── Switching providers = rewrite AuthService implementation, not the entire app
  └── Auth provider config (pool IDs, client IDs, URLs) lives in env vars — not in code
```

**GOOD**
```typescript
// auth/AuthService.ts — interface
interface AuthService {
  signup(email: string, metadata?: Record<string, string>): Promise<{ userId: string }>;
  login(email: string, password: string): Promise<AuthTokens>;
  logout(): Promise<void>;
  sendPasswordResetEmail(email: string): Promise<void>;
  setPassword(token: string, newPassword: string): Promise<void>;
  refreshToken(refreshToken: string): Promise<AuthTokens>;
  getCurrentUser(): Promise<User | null>;
}

// auth/providers/CognitoAuthService.ts — implementation
// auth/providers/FirebaseAuthService.ts — implementation
// auth/providers/SupabaseAuthService.ts — implementation
```

**BAD** — calling provider directly in components:
```typescript
import { signInWithEmailAndPassword } from 'firebase/auth';
// Scattered across 15 components, impossible to switch providers
```

---

## 3. Token Management

```
MANDATORY:
  ├── Access tokens: short-lived (15-60 minutes)
  ├── Refresh tokens: longer-lived (7-30 days), used to get new access tokens
  ├── Web: store tokens in httpOnly, secure, sameSite cookies — NEVER localStorage
  ├── Mobile (React Native/Flutter): use platform secure storage (Keychain/Keystore)
  ├── Auto-refresh: intercept 401 responses, refresh token, retry the request
  ├── NEVER store tokens in JavaScript-accessible storage (localStorage, sessionStorage)
  └── NEVER send tokens in URL query parameters
```

**GOOD** — auto-refresh interceptor:
```typescript
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401 && !error.config._retry) {
      error.config._retry = true;
      const newTokens = await authService.refreshToken(getRefreshToken());
      setTokens(newTokens);
      error.config.headers.Authorization = `Bearer ${newTokens.accessToken}`;
      return api(error.config);
    }
    return Promise.reject(error);
  }
);
```

---

## 4. Password Policy

```
MANDATORY:
  ├── Minimum 8 characters — no maximum (allow up to 128)
  ├── Require mix of: uppercase, lowercase, number, special character
  ├── Check against common password list (top 10,000) — reject "Password123!"
  ├── Show password strength indicator in real-time as user types
  ├── Allow paste into password fields — NEVER disable paste
  ├── NEVER store plaintext passwords — hashing is server-side only (bcrypt/argon2)
  ├── NEVER transmit password requirements to the client beyond the UI hints
  └── Rate-limit login attempts: lock after 5 failed attempts for 15 minutes
```

---

## 5. Session Management

```
MANDATORY:
  ├── Logout clears ALL state: tokens, cached user data, in-memory state
  ├── Logout invalidates the refresh token server-side (not just client delete)
  ├── Session timeout: auto-logout after inactivity period (configurable per app)
  ├── Multi-tab sync (web): logout in one tab logs out all tabs
  ├── Token expiry: show "session expired" message, redirect to login
  ├── NEVER keep stale auth state — if token refresh fails, force logout
  └── On app startup: validate the stored token before showing authenticated UI
```

**GOOD** — multi-tab logout sync:
```typescript
// Listen for storage events (fires when another tab changes storage)
window.addEventListener('storage', (event) => {
  if (event.key === 'logout-event') {
    authService.clearLocalState();
    window.location.href = '/login';
  }
});

// On logout, broadcast to other tabs
function logout() {
  localStorage.setItem('logout-event', Date.now().toString());
  localStorage.removeItem('logout-event');
  authService.logout();
}
```

---

## 6. Social Auth / OAuth

```
WHEN SUPPORTING SOCIAL LOGIN:
  ├── Use OAuth 2.0 / OpenID Connect — NEVER custom social auth flows
  ├── Handle "email already exists" — offer to link accounts, don't create duplicates
  ├── Store the provider + provider user ID alongside the local account
  ├── Social login creates a local account on first use (same as email signup, but pre-verified)
  ├── Allow users to set a password later (to enable email+password login alongside social)
  ├── NEVER trust the email from the OAuth provider without verifying it's the same user
  └── Implement PKCE for public clients (SPAs, mobile apps)
```

**Account linking flow:**
```
1. User clicks "Sign in with Google" → OAuth flow → returns email: jane@example.com
2. Server checks: does jane@example.com already have an account?
   YES → Link Google provider to existing account → login
   NO  → Create new account with Google as primary provider → login
3. User can later set a password to also use email+password login
```

---

## 7. Email Verification

```
MANDATORY:
  ├── Email must be verified before account is fully activated
  ├── Verification link = one-time token, expires in 24 hours
  ├── Unverified accounts: allow login but restrict access (show "verify your email" banner)
  ├── Resend verification: rate-limit to 3 per hour
  ├── After email change: re-verify the new email before switching
  └── NEVER expose whether an email is registered (prevents enumeration)
```

**Anti-enumeration pattern:**
```
// BAD — reveals whether email exists
"No account found for jane@example.com"

// GOOD — same message regardless
"If an account exists for this email, you'll receive a password reset link"
```

---

## 8. Multi-Factor Authentication (MFA)

```
WHEN MFA IS REQUIRED:
  ├── Support TOTP (authenticator app) as primary — SMS as fallback only
  ├── Provide recovery codes (8-10 one-time codes) during MFA setup
  ├── Store recovery codes hashed — display only once during setup
  ├── MFA enrollment: optional by default, mandatory for admin/elevated roles
  ├── Remember device: offer "trust this device for 30 days" option
  └── NEVER use email as a second factor — it's the same channel as password reset
```

---

## 9. Authorization Patterns

```
MANDATORY:
  ├── Role-based access control (RBAC): define roles with explicit permissions
  ├── Check permissions server-side on EVERY request — client checks are UI hints only
  ├── Define roles as enums: ADMIN, MEMBER, VIEWER — not strings
  ├── Permission check: can(user, action, resource) — not role string comparison
  ├── UI: hide or disable actions the user can't perform — don't show then reject
  ├── API: return 403 Forbidden for unauthorized actions — not 404
  └── NEVER derive permissions from user properties — use explicit role → permission mapping
```

**GOOD**
```typescript
// Define permissions explicitly
const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  [UserRole.ADMIN]: ['users:read', 'users:write', 'users:delete', 'settings:write'],
  [UserRole.MEMBER]: ['users:read', 'users:write'],
  [UserRole.VIEWER]: ['users:read'],
};

function can(user: User, permission: Permission): boolean {
  return ROLE_PERMISSIONS[user.role]?.includes(permission) ?? false;
}

// In API handler
if (!can(currentUser, 'users:delete')) {
  throw new ForbiddenError('Insufficient permissions');
}
```

---

## 10. Auth-Related Security

```
MANDATORY:
  ├── All auth endpoints over HTTPS — no exceptions
  ├── CSRF protection on auth forms (use framework's built-in CSRF tokens)
  ├── Brute force protection: rate-limit login, lock after N failures
  ├── Password reset tokens: single-use, time-limited, cryptographically random
  ├── Log all auth events: login, logout, failed attempts, password changes, MFA events
  ├── NEVER log passwords, tokens, or session IDs — even in error logs
  ├── NEVER include auth tokens in URLs — use headers or cookies
  └── Rotate signing keys periodically (JWT secret, cookie signing key)
```

---

## 11. Auth UI Patterns

```
MANDATORY:
  ├── Login form: email + password + "Forgot password?" link + social login buttons
  ├── Signup form: email + app-specific fields + "Already have an account?" link
  ├── Forgot password: email input → "Check your email" (same message regardless of email existence)
  ├── Set password: new password + confirm password + strength indicator
  ├── Loading state on all auth buttons — disable during submission
  ├── Show/hide password toggle on password fields
  ├── Preserve form data on validation errors — don't clear the form
  └── Redirect to intended destination after login (not always to homepage)
```

**Redirect after login:**
```typescript
// Before redirecting to login, store the intended URL
const returnUrl = window.location.pathname;
router.push(`/login?returnUrl=${encodeURIComponent(returnUrl)}`);

// After successful login
const returnUrl = searchParams.get('returnUrl') || '/dashboard';
router.push(returnUrl);
```

---

## 12. Anti-Patterns

```
NEVER:
  ├── Password at registration — use email-first, set-password-later flow
  ├── Tokens in localStorage — use httpOnly cookies (web) or secure storage (mobile)
  ├── Tokens in URL query parameters
  ├── Calling auth provider directly from components — use AuthService abstraction
  ├── Revealing whether an email is registered ("no account found for...")
  ├── Client-side-only permission checks — always enforce server-side
  ├── Same message for login failure types ("wrong password" vs "account locked")
  ├── Disabling paste on password fields
  ├── Email as a second factor for MFA
  ├── Storing plaintext passwords or unhashed recovery codes
  └── Silent token expiry — always inform the user and redirect to login
```

---

## Auth Verification Checklist

- [ ] Signup is email-first — no password at registration
- [ ] Set-password and forgot-password share the same token-based flow
- [ ] Auth provider wrapped in AuthService interface — no direct provider calls
- [ ] Tokens stored in httpOnly cookies (web) or secure storage (mobile)
- [ ] Access tokens short-lived with auto-refresh on 401
- [ ] Logout clears all state and invalidates refresh token server-side
- [ ] Multi-tab logout sync (web)
- [ ] Password policy enforced with strength indicator
- [ ] Login rate-limited — lock after 5 failed attempts
- [ ] Email enumeration prevented (same response for existing/non-existing emails)
- [ ] Social auth handles account linking for existing emails
- [ ] Permissions checked server-side on every request
- [ ] Roles defined as enums with explicit permission mapping
- [ ] All auth events logged (no tokens/passwords in logs)
- [ ] Redirect to intended destination after login
