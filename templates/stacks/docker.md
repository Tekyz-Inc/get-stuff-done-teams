# Docker Standards

These rules are MANDATORY. Violations fail the task. No exceptions.

---

## 1. Dockerfile — Multi-Stage Builds

```
MANDATORY:
  ├── Use multi-stage builds — separate build and runtime stages
  ├── Final stage uses a minimal base image (alpine, distroless, slim)
  ├── NEVER install dev dependencies in the runtime stage
  ├── Pin base image versions — NEVER use :latest
  └── One service per container — not multiple processes
```

**BAD**
```dockerfile
FROM node:20
COPY . .
RUN npm install
CMD ["node", "server.js"]
```

**GOOD**
```dockerfile
# Build stage
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --production=false
COPY . .
RUN npm run build

# Runtime stage
FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package*.json ./
USER node
EXPOSE 3000
CMD ["node", "dist/server.js"]
```

---

## 2. Layer Optimization

```
MANDATORY:
  ├── Copy package.json/lock files BEFORE source code — leverage layer cache
  ├── Use .dockerignore to exclude node_modules, .git, .env, build artifacts
  ├── Combine RUN commands where logical — each RUN creates a layer
  ├── Clean up caches in the same RUN that creates them
  └── Order instructions from least-changing to most-changing
```

**GOOD** `.dockerignore`:
```
node_modules
.git
.env*
dist
*.md
.gsd-t
```

---

## 3. Security

```
MANDATORY:
  ├── Run as non-root user (USER node, USER nobody, or create a dedicated user)
  ├── NEVER copy .env files into the image — use runtime env vars or secrets
  ├── NEVER hardcode secrets, tokens, or passwords in Dockerfile
  ├── Use COPY not ADD (ADD can auto-extract archives and fetch URLs — too implicit)
  ├── Scan images for vulnerabilities (docker scout, trivy, snyk)
  └── Set HEALTHCHECK instruction for production images
```

---

## 4. Docker Compose

```
MANDATORY:
  ├── Use compose.yaml (not docker-compose.yml — modern naming)
  ├── Always specify depends_on with condition: service_healthy where possible
  ├── Use named volumes for persistent data — NEVER bind-mount data directories in production
  ├── Define networks explicitly — don't rely on the default bridge
  ├── Environment variables via env_file — not inline in compose.yaml
  └── Pin image versions in compose — no :latest
```

**GOOD**
```yaml
services:
  api:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    env_file: .env
    depends_on:
      db:
        condition: service_healthy
    networks:
      - app-network

  db:
    image: postgres:16-alpine
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - app-network

volumes:
  pgdata:

networks:
  app-network:
```

---

## 5. Image Tagging

```
MANDATORY:
  ├── Tag with semantic version: myapp:1.2.3
  ├── Also tag with git SHA for traceability: myapp:abc1234
  ├── Tag :latest only on the main/production branch
  ├── NEVER push untagged images to a registry
  └── Use consistent naming: {registry}/{org}/{app}:{tag}
```

---

## 6. Development vs Production

```
MANDATORY:
  ├── Use compose.override.yaml for dev-specific config (hot reload, debug ports)
  ├── Dev: bind-mount source code for hot reload
  ├── Prod: COPY built artifacts — no bind mounts
  ├── Dev: include dev dependencies and debug tools
  ├── Prod: production dependencies only, no source maps
  └── NEVER use the dev image in production
```

---

## 7. Health Checks

```
MANDATORY for production:
  ├── HEALTHCHECK in Dockerfile for standalone containers
  ├── healthcheck in compose for orchestrated services
  ├── Check actual readiness (HTTP endpoint, DB connection) — not just process alive
  ├── Reasonable intervals: 10-30s interval, 3-5 retries
  └── Lightweight check — don't hit expensive endpoints
```

---

## 8. Anti-Patterns

```
NEVER:
  ├── :latest in production — pin versions
  ├── Root user in containers — always USER non-root
  ├── Secrets in build args or ENV — use runtime secrets
  ├── ADD when COPY suffices
  ├── Multiple services in one container — one process per container
  ├── Ignoring .dockerignore — bloated images and leaked files
  ├── apt-get install without cleanup in the same RUN
  └── Bind-mounting host paths in production compose
```

---

## Docker Verification Checklist

- [ ] Multi-stage build with minimal runtime image
- [ ] Base images pinned to specific versions
- [ ] .dockerignore excludes node_modules, .git, .env
- [ ] Runs as non-root user
- [ ] No secrets in Dockerfile or build args
- [ ] Layer cache optimized (package files before source)
- [ ] HEALTHCHECK defined
- [ ] Compose uses named volumes and explicit networks
- [ ] Images tagged with version and git SHA
- [ ] Dev and prod configs separated
