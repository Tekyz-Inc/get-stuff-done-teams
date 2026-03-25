# Firebase Standards

These rules are MANDATORY. Violations fail the task. No exceptions.

---

## 1. Firestore Security Rules

```
MANDATORY:
  ├── Default-deny: rules start with allow read, write: if false;
  ├── Write granular rules per collection and operation (read, create, update, delete)
  ├── Use request.auth.uid for user-scoped access — NEVER trust client-sent IDs
  ├── Validate data shape in rules: request.resource.data.field is string
  ├── Test rules with the Firebase Emulator before deploying
  └── NEVER use allow read, write: if true in production
```

**GOOD**
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read: if request.auth != null && request.auth.uid == userId;
      allow update: if request.auth != null && request.auth.uid == userId
        && request.resource.data.keys().hasOnly(['displayName', 'avatar', 'updatedAt'])
        && request.resource.data.displayName is string
        && request.resource.data.displayName.size() <= 100;
      allow create, delete: if false;
    }
  }
}
```

---

## 2. Firestore Data Modeling

```
MANDATORY:
  ├── Denormalize for read performance — Firestore charges per read, not per field
  ├── Subcollections for large or unbounded lists (messages, orders)
  ├── Embedded objects for small, bounded data that's always read together
  ├── Store document IDs as fields when needed for queries
  ├── Use server timestamps: serverTimestamp() — not client Date.now()
  └── NEVER create deeply nested subcollection hierarchies (max 2-3 levels)
```

**GOOD**
```typescript
// User document — embedded small data
{
  id: "user-123",
  displayName: "Jane Doe",
  email: "jane@example.com",
  settings: { theme: "dark", notifications: true },  // embedded — always read together
  createdAt: serverTimestamp(),
}

// Orders — subcollection (unbounded, queried separately)
// /users/user-123/orders/{orderId}
```

---

## 3. Cloud Functions

```
MANDATORY:
  ├── Use v2 functions (onRequest, onCall, onDocumentWritten) — not v1
  ├── Validate ALL inputs in onCall functions — they're public endpoints
  ├── Set memory and timeout limits per function
  ├── Use secrets manager for API keys — not environment config
  ├── Idempotent design — functions may retry on failure
  └── Keep functions focused — one responsibility per function
```

**GOOD**
```typescript
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { z } from 'zod';

const schema = z.object({ orderId: z.string().uuid() });

export const cancelOrder = onCall({ memory: '256MiB', timeoutSeconds: 30 }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Must be logged in');

  const parsed = schema.safeParse(request.data);
  if (!parsed.success) throw new HttpsError('invalid-argument', 'Invalid input');

  await db.collection('orders').doc(parsed.data.orderId).update({ status: 'cancelled' });
  return { success: true };
});
```

---

## 4. Authentication

```
MANDATORY:
  ├── Use Firebase Auth — don't build custom auth alongside it
  ├── Store additional user data in Firestore — not in Auth custom claims (limited to 1KB)
  ├── Custom claims for roles/permissions only (admin, moderator)
  ├── Handle auth state with onAuthStateChanged listener
  ├── Sign out clears local state — don't leave stale data
  └── NEVER store Firebase API keys as secrets — they're meant to be public (security rules protect data)
```

---

## 5. Storage Rules

```
MANDATORY:
  ├── Restrict uploads by file type and size in rules
  ├── User-scoped paths: /users/{userId}/avatar — match in rules
  ├── Validate content type: request.resource.contentType.matches('image/.*')
  ├── Set max file size in rules: request.resource.size < 5 * 1024 * 1024
  └── NEVER allow public write access to storage
```

---

## 6. Emulator and Local Development

```
MANDATORY:
  ├── Use Firebase Emulator Suite for local development
  ├── Test security rules against the emulator before deploying
  ├── Seed data via emulator import — not manual dashboard entry
  ├── CI runs tests against emulators — not production
  └── Never connect to production from local development
```

---

## 7. Anti-Patterns

```
NEVER:
  ├── allow read, write: if true in production rules
  ├── Trusting client-sent user IDs — use request.auth.uid
  ├── Deep subcollection nesting (4+ levels)
  ├── Large documents (> 1MB) — split into subcollections
  ├── Reading entire collections without query limits
  ├── v1 Cloud Functions for new code — use v2
  ├── Storing secrets in Firebase config — use Secret Manager
  └── Testing against production — use emulators
```

---

## Firebase Verification Checklist

- [ ] Security rules default-deny with granular per-collection policies
- [ ] request.auth.uid used for access control — no client IDs trusted
- [ ] Data model optimized for reads (denormalized where appropriate)
- [ ] Subcollections for unbounded lists
- [ ] Cloud Functions v2 with input validation
- [ ] Functions are idempotent
- [ ] Storage rules restrict file type and size
- [ ] All rules tested against emulator
- [ ] serverTimestamp() used — not client timestamps
- [ ] No allow read, write: if true in production
