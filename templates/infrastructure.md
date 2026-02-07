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
