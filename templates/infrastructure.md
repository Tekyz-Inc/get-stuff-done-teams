# Infrastructure — {Project Name}

## Last Updated: {Date}

## Quick Reference

| Task | Command |
|------|---------|
| Start dev server | `{command}` |
| Run tests | `{command}` |
| Run migrations | `{command}` |
| Deploy | `{command}` |

## Local Development

### Setup
```bash
# Clone and install
git clone {repo}
cd {project}
{install commands}

# Environment
cp .env.example .env
# Fill in required values (see Credentials section)

# Database
{db setup commands}

# Start
{start command}
```

### Local URLs
- App: http://localhost:{port}
- API docs: http://localhost:{port}/docs
- Database: localhost:{port}

## Database

### Migrations
```bash
# Create migration
{command}

# Apply migrations
{command}

# Rollback
{command}
```

### Direct Access
```bash
# Local
{command}

# Production
{command}
```

### Backup & Restore
```bash
# Backup
{command}

# Restore
{command}
```

<!-- gsd-t-env-registry:start -->
## Environments

> **Map, not secrets.** This table records only WHERE an environment lives and
> HOW to reach it — host/port/name/auth-method/which-vault-holds-the-secret/the
> env-var NAME/the fetch + connect commands. It NEVER stores a secret VALUE.
> The value lives in the vault (`.env` / Vercel / Neon / Google Secret Manager)
> and is pulled at runtime via the env-var NAME. A missing row → HALT and
> document (detect → ask → record → proceed); never guess a connection string,
> never grep transcripts to rediscover.

| id | scope | kind | host | port | db/name | auth method | secret vault | secret env-var NAME | fetch command | connect command | access gotchas | read-only default | recorded |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
<!-- gsd-t-env-registry:end -->

<!--
  Column notes:
    scope             = local | staging | prod
    kind              = postgres | mysql | redis | http-api | ssh-host | ...
    secret vault      = local (.env) | Vercel | Neon | Google Secret Manager | ...
    secret env-var NAME = e.g. DATABASE_URL_PROD  — the NAME only, NEVER the value
    host              = POSITIVE shape: localhost | IPv4 | dotted DNS hostname |
                        short lowercase service name (letters+hyphen, no digits, e.g. db, postgres)
    db/name           = short lowercase snake identifier (<=16, e.g. binvoice_prod, analytics)
    auth method       = ENUMERATED — password | iam | oauth | oauth2 | service-account |
                        ssh-key | api-key | none | scram-sha-256 | md5 | trust | token | key | ...
    fetch command     = how to pull the secret from its vault (e.g. `vercel env pull`)
                        POSITIVE allowlist: a token is accepted ONLY if it IS a $VAR/${VAR} ref,
                        a flag, a hostname/IP, a .env dotfile, or a curated CLI/db word.
                        Any OTHER bare literal is REJECTED (move it to an env var, reference as $VAR).
    connect command   = references the env-var by name: `psql "$DATABASE_URL_PROD"` (same allowlist)
    access gotchas    = ENUMERATED — vpn | ip-allowlist | ssh-tunnel | bastion | none,
                        optionally `via <hostname>` (e.g. `ssh-tunnel via bastion.example.com`).
                        Free prose is FORBIDDEN (nowhere for a secret to hide).
    read-only default = YES for scope=prod unless a human explicitly recorded write-ok
  There is deliberately NO secret-value column — a row is structurally incapable
  of holding a secret. Populated by `gsd-t-env-registry` (record-at-create +
  capture-on-first-need).
-->

## Credentials & Secrets

### Local (.env)
| Variable | Purpose | Where to get it |
|----------|---------|-----------------|
| DATABASE_URL | Database connection | Local setup |
| SECRET_KEY | JWT signing | Generate with `{command}` |

### Production
| Secret | Location | How to access |
|--------|----------|---------------|
| {name} | {e.g., GCP Secret Manager} | `{command}` |

## Deployment

### Production
```bash
# Build
{command}

# Deploy
{command}

# Verify
{command}
```

### CI/CD
- **Pipeline**: {e.g., GitHub Actions}
- **Trigger**: {e.g., push to main}
- **Steps**: {build → test → deploy}

## Logging & Monitoring

### View Logs
```bash
# Production logs
{command}

# Follow logs
{command}
```

### Monitoring
- **Dashboard**: {url}
- **Alerts**: {configuration}
