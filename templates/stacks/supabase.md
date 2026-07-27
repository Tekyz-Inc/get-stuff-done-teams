# Supabase Standards

These rules are MANDATORY. Violations fail the task. No exceptions.

---

## 1. Row Level Security (RLS)

```
MANDATORY:
  ├── Enable RLS on EVERY table — no exceptions
  ├── Default-deny: tables with RLS enabled and no policies block all access
  ├── Write policies per role: anon, authenticated, service_role
  ├── Use auth.uid() for user-scoped policies — NEVER trust client-sent user IDs
  ├── Test policies with different roles before deploying
  └── Service role bypasses RLS — only use server-side, NEVER expose the service key
```

**GOOD**
```sql
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Users can read their own profile
CREATE POLICY "Users read own profile"
  ON user_profiles FOR SELECT
  USING (auth.uid() = user_id);

-- Users can update their own profile
CREATE POLICY "Users update own profile"
  ON user_profiles FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

---

## 2. Auth Patterns

```
MANDATORY:
  ├── Use Supabase Auth — don't build custom auth alongside it
  ├── Store user metadata in a separate profiles table — not in auth.users
  ├── Create profile on signup via database trigger or auth hook
  ├── Use auth.uid() in RLS policies — it's the trusted source of identity
  ├── Handle auth state changes with onAuthStateChange listener
  └── NEVER store the service_role key in client code — it bypasses RLS
```

**GOOD** — trigger to create profile:
```sql
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_profiles (user_id, email, display_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'display_name', ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
```

---

## 3. Client Usage

```
MANDATORY:
  ├── Initialize client once — export from a shared module
  ├── Use typed client with generated types: supabase-js + supabase gen types
  ├── Handle errors from every Supabase call — check { data, error } response
  ├── Use .select() with specific columns — NEVER .select('*') in production
  ├── Use .single() when expecting one row — throws if 0 or 2+ rows
  └── Regenerate types after every migration: npx supabase gen types typescript
```

**GOOD**
```typescript
const { data, error } = await supabase
  .from('user_profiles')
  .select('id, email, display_name, role')
  .eq('user_id', userId)
  .single();

if (error) throw new DatabaseError('Failed to fetch profile', error);
```

---

## 4. Edge Functions

```
MANDATORY:
  ├── Use for server-side logic that needs secrets or external API calls
  ├── Validate ALL inputs — edge functions are public endpoints
  ├── Use Zod or manual validation at the entry point
  ├── Set CORS headers explicitly
  ├── Handle errors with proper HTTP status codes
  └── Keep functions focused — one concern per function
```

---

## 5. Realtime

```
WHEN USING REALTIME:
  ├── Enable realtime only on tables that need it — not all tables
  ├── Subscribe with filters to reduce message volume
  ├── Unsubscribe on component unmount — prevent memory leaks
  ├── Handle reconnection gracefully
  └── RLS applies to realtime — users only receive rows they can SELECT
```

**GOOD**
```typescript
const channel = supabase
  .channel('user-orders')
  .on('postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'orders', filter: `user_id=eq.${userId}` },
    (payload) => handleNewOrder(payload.new)
  )
  .subscribe();

// Cleanup
return () => { supabase.removeChannel(channel); };
```

---

## 6. Storage

```
MANDATORY:
  ├── Create separate buckets per use case (avatars, documents, uploads)
  ├── Set bucket-level access policies (public vs private)
  ├── Validate file type and size before upload — client AND server side
  ├── Use signed URLs for private file access — not public URLs
  ├── Set file size limits per bucket
  └── NEVER store sensitive documents in public buckets
```

---

## 6.5. Schema Design — Primary Keys

Supabase is PostgreSQL — the full PostgreSQL standards apply. The primary-key rule:

```
MANDATORY:
  ├── EVERY new table has a self-incrementing integer primary key named id
  │     id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY
  ├── API-exposed tables ALSO get public_id UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE
  │     PostgREST exposes every table over HTTP by default — treat tables as API-exposed
  │     unless RLS blocks all client access. Return public_id to clients, never the integer id.
  ├── A user_id column referencing auth.users STAYS UUID — auth.uid() returns a UUID and
  │     RLS policies compare against it directly. This is NOT the table's primary key.
  └── Existing tables are NOT retrofitted (see PostgreSQL standards §2 Scope)
```

**GOOD**
```sql
CREATE TABLE user_profiles (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  public_id UUID NOT NULL DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,  -- UUID: RLS compares to auth.uid()
  display_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_user_profiles_public_id UNIQUE (public_id)
);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own profile"
  ON user_profiles FOR SELECT
  USING (auth.uid() = user_id);
```

---

## 7. Migrations

```
MANDATORY:
  ├── Use supabase db diff or manual SQL files for migrations
  ├── One migration per change — don't combine unrelated changes
  ├── Test migrations locally: supabase db reset
  ├── Always regenerate types after migration: supabase gen types typescript
  ├── Include RLS policies in migration files — not applied manually
  └── Seed data in a separate seed.sql file
```

---

## 8. Anti-Patterns

```
NEVER:
  ├── Expose service_role key to client — it bypasses RLS
  ├── Tables without RLS enabled
  ├── .select('*') in production queries
  ├── Trusting client-sent user IDs — use auth.uid()
  ├── Storing user data in auth.users metadata instead of a profiles table
  ├── Realtime on all tables — enable selectively
  ├── Ignoring { error } from Supabase calls
  └── Manual SQL in Supabase dashboard instead of migration files
```

---

## Supabase Verification Checklist

- [ ] Every NEW table has a self-incrementing integer `id` primary key
- [ ] API-exposed tables have a UNIQUE `public_id UUID` — clients get public_id, not the integer id
- [ ] `user_id` columns referencing auth.users are UUID (RLS compares to auth.uid())
- [ ] RLS enabled on every table with explicit policies
- [ ] auth.uid() used in policies — no client-sent user IDs trusted
- [ ] Service role key only used server-side
- [ ] Typed client with generated types (supabase gen types)
- [ ] Specific column selects — no .select('*')
- [ ] Error handling on every Supabase call
- [ ] Realtime subscriptions cleaned up on unmount
- [ ] Storage buckets have access policies and file limits
- [ ] Migrations in version control — not manual dashboard SQL
- [ ] Types regenerated after every migration
