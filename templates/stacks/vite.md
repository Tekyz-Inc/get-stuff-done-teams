# Vite Standards

These rules are MANDATORY. Violations fail the task. No exceptions.

---

## 1. Environment Variables

```
MANDATORY:
  ├── Prefix ALL client-exposed env vars with VITE_ — Vite strips others
  ├── Access via import.meta.env.VITE_* — NEVER process.env (that's Node, not Vite)
  ├── Commit .env.development and .env.production — no secrets in either
  ├── Add .env.local to .gitignore — developer-specific overrides only
  └── NEVER put API keys or secrets in VITE_ vars — they're bundled into client code
```

**BAD**
```typescript
const url = process.env.API_URL;           // undefined in browser
const key = import.meta.env.VITE_API_KEY;  // secret exposed to client!
```

**GOOD**
```typescript
// .env.development
// VITE_API_BASE_URL=http://localhost:4000/api

// src/lib/constants.ts
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api';
```

---

## 2. Config File

```
MANDATORY:
  ├── vite.config.ts (TypeScript) — not .js
  ├── Define resolve.alias for clean imports (@/ → src/)
  ├── Configure server.proxy for API calls in dev — avoid CORS issues
  ├── Set build.sourcemap to true for staging, false for production
  └── Keep plugins list minimal — each plugin adds build time
```

**GOOD**
```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  server: {
    proxy: {
      '/api': { target: 'http://localhost:4000', changeOrigin: true },
    },
  },
});
```

---

## 3. Build Optimization

```
MANDATORY:
  ├── Code-split route-level components with React.lazy (or framework equivalent)
  ├── Configure manualChunks for large vendor libs (react, lodash, chart libs)
  ├── Check bundle size: npx vite-bundle-visualizer after build
  ├── Tree-shaking: use named imports — not default imports from barrel files
  └── Set chunk size warning limit in config if needed
```

**GOOD** — manual chunks:
```typescript
build: {
  rollupOptions: {
    output: {
      manualChunks: {
        vendor: ['react', 'react-dom'],
        query: ['@tanstack/react-query'],
      },
    },
  },
},
```

---

## 4. Path Aliases and Imports

```
MANDATORY:
  ├── Configure @/ alias in vite.config.ts AND tsconfig.json (both must match)
  ├── Use @/ for cross-feature imports — relative for same-directory
  ├── NEVER use deep relative paths (../../../shared/lib/helpers)
  └── Barrel exports (index.ts) for feature public APIs — not for internal modules
```

**tsconfig.json** must match:
```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": { "@/*": ["src/*"] }
  }
}
```

---

## 5. Dev Server

```
MANDATORY:
  ├── Use server.proxy for backend API — NEVER hardcode localhost URLs in fetch calls
  ├── Enable server.open only if desired — don't force it
  ├── HMR should work — if it doesn't, check file naming (PascalCase components)
  └── For HTTPS in dev: use @vitejs/plugin-basic-ssl — not self-signed certs
```

---

## 6. Testing Integration

```
MANDATORY:
  ├── Use Vitest (not Jest) — it shares Vite's config and transform pipeline
  ├── Configure test block in vite.config.ts or vitest.config.ts
  ├── Set environment: 'jsdom' for component tests
  ├── Use the same path aliases in tests — Vitest inherits from vite.config
  └── Happy-dom is faster than jsdom — use if no compatibility issues
```

**GOOD**
```typescript
// vite.config.ts
export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test-setup.ts',
  },
});
```

---

## 7. Anti-Patterns

```
NEVER:
  ├── process.env in client code (use import.meta.env)
  ├── Secrets in VITE_ env vars — they're in the bundle
  ├── Jest when Vitest is available — Vitest is faster and shares config
  ├── Deep relative imports (../../..) — use @/ alias
  ├── Importing entire libraries (import _ from 'lodash') — use named (import { debounce })
  └── Disabling HMR to "fix" issues — find the root cause
```

---

## Vite Verification Checklist

- [ ] All client env vars prefixed with VITE_
- [ ] No secrets in VITE_ variables
- [ ] import.meta.env used — not process.env
- [ ] Path alias @/ configured in both vite.config.ts and tsconfig.json
- [ ] server.proxy configured for API calls
- [ ] Bundle analyzed — no oversized chunks
- [ ] Vitest configured (not Jest)
- [ ] .env.local in .gitignore
