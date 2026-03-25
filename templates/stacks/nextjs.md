# Next.js Standards

These rules are MANDATORY. Violations fail the task. No exceptions.

---

## 1. App Router (Next.js 13+)

```
MANDATORY:
  ├── Use the App Router (app/) — not Pages Router (pages/) for new projects
  ├── Default to Server Components — add 'use client' ONLY when needed
  ├── 'use client' needed for: useState, useEffect, event handlers, browser APIs
  ├── Keep 'use client' boundary as low as possible — don't mark entire pages
  └── NEVER import server-only code in client components
```

**BAD** — marking the whole page as client:
```tsx
'use client'; // ← Unnecessary — only the button needs interactivity
export default function Page() {
  return <div><h1>Static content</h1><LikeButton /></div>;
}
```

**GOOD** — push client boundary down:
```tsx
// app/page.tsx — Server Component (default)
export default function Page() {
  return <div><h1>Static content</h1><LikeButton /></div>;
}

// components/LikeButton.tsx
'use client';
export function LikeButton() {
  const [liked, setLiked] = useState(false);
  return <button onClick={() => setLiked(!liked)}>Like</button>;
}
```

---

## 2. Data Fetching

```
MANDATORY:
  ├── Server Components: fetch directly (async component) — no useEffect
  ├── Client Components: React Query for server data — same as react.md Section 1
  ├── Use Route Handlers (app/api/) for API endpoints — not pages/api/
  ├── Set revalidate or cache options on server-side fetches
  └── NEVER fetch from your own API routes in Server Components — call the function directly
```

**BAD** — Server Component calling its own API:
```tsx
// app/page.tsx
const res = await fetch('http://localhost:3000/api/users'); // calling yourself!
```

**GOOD** — call the data function directly:
```tsx
// app/page.tsx
import { getUsers } from '@/lib/data/users';
export default async function Page() {
  const users = await getUsers();
  return <UserList users={users} />;
}
```

---

## 3. Route Structure

```
MANDATORY:
  ├── app/{route}/page.tsx — page component
  ├── app/{route}/layout.tsx — shared layout (wraps child pages)
  ├── app/{route}/loading.tsx — Suspense fallback for the route
  ├── app/{route}/error.tsx — error boundary for the route ('use client')
  ├── app/{route}/not-found.tsx — 404 for the route
  ├── Group routes with (parentheses) for layout grouping: app/(auth)/login
  └── Dynamic routes: app/users/[id]/page.tsx
```

---

## 4. Server Actions

```
MANDATORY (Next.js 14+):
  ├── Use Server Actions for form mutations — not client-side API calls
  ├── Mark with 'use server' at the top of the function or file
  ├── Validate ALL inputs with Zod — Server Actions are public endpoints
  ├── Return typed results — not raw responses
  └── Revalidate cache after mutations: revalidatePath() or revalidateTag()
```

**GOOD**
```tsx
'use server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';

const schema = z.object({ name: z.string().min(2), email: z.string().email() });

export async function createUser(formData: FormData) {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.flatten() };

  await db.user.create({ data: parsed.data });
  revalidatePath('/users');
  return { success: true };
}
```

---

## 5. Environment Variables

```
MANDATORY:
  ├── NEXT_PUBLIC_ prefix for client-exposed vars — all others are server-only
  ├── NEVER put secrets in NEXT_PUBLIC_ vars — they're in the client bundle
  ├── Access server-only vars in Server Components, Route Handlers, Server Actions
  ├── Validate env vars at startup with t3-env or manual checks
  └── .env.local in .gitignore — commit .env.example with placeholder values
```

---

## 6. Metadata and SEO

```
MANDATORY:
  ├── Export metadata object or generateMetadata function from page.tsx
  ├── Every page needs title and description at minimum
  ├── Use template for consistent titles: { template: '%s | AppName' }
  ├── Set Open Graph and Twitter card metadata for shared pages
  └── Add robots.txt and sitemap.xml via app/robots.ts and app/sitemap.ts
```

---

## 7. Middleware

```
WHEN NEEDED:
  ├── Use middleware.ts at project root for auth redirects, geolocation, headers
  ├── Keep middleware fast — it runs on EVERY request matching the matcher
  ├── Use matcher config to limit which routes trigger middleware
  ├── NEVER do heavy computation or database calls in middleware
  └── Use NextResponse.next() to continue, NextResponse.redirect() to redirect
```

---

## 8. Anti-Patterns

```
NEVER:
  ├── 'use client' on entire pages when only a small part needs interactivity
  ├── useEffect + fetch in components when a Server Component would work
  ├── Fetching your own API routes from Server Components
  ├── Server Actions without input validation — they're public endpoints
  ├── Secrets in NEXT_PUBLIC_ env vars
  ├── getServerSideProps / getStaticProps (Pages Router) in App Router projects
  ├── Importing server-only modules (fs, db) in 'use client' components
  └── Massive layouts that re-render on every navigation
```

---

## Next.js Verification Checklist

- [ ] App Router used (app/ directory)
- [ ] Server Components by default — 'use client' only where needed
- [ ] Client boundary pushed as low as possible
- [ ] Server fetches call functions directly — not own API routes
- [ ] Server Actions validate input with Zod
- [ ] Cache revalidated after mutations
- [ ] Every page has metadata (title + description)
- [ ] loading.tsx and error.tsx for each major route
- [ ] No secrets in NEXT_PUBLIC_ vars
- [ ] Middleware is fast and uses matcher config
