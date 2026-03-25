# GitHub Actions Standards

These rules are MANDATORY. Violations fail the task. No exceptions.

---

## 1. Workflow Structure

```
MANDATORY:
  ├── One workflow per concern: ci.yml, deploy.yml, release.yml
  ├── Name workflows clearly: name: "CI — Lint, Test, Build"
  ├── Trigger on specific events — NEVER use on: push without branch filters
  ├── Use workflow_dispatch for manual triggers on deploy/release workflows
  └── Keep workflows under 200 lines — extract reusable logic to composite actions
```

**GOOD**
```yaml
name: CI — Lint, Test, Build
on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]
```

---

## 2. Job Design

```
MANDATORY:
  ├── Name jobs descriptively: jobs: lint:, jobs: test-unit:, jobs: build:
  ├── Use needs: for job dependencies — parallelize independent jobs
  ├── Set timeout-minutes on every job (default 360 is too long)
  ├── Use matrix strategy for multi-version/multi-platform testing
  └── Fail fast by default — set fail-fast: false only when you need all results
```

**GOOD**
```yaml
jobs:
  lint:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps: ...

  test:
    needs: lint
    runs-on: ubuntu-latest
    timeout-minutes: 15
    strategy:
      matrix:
        node-version: [18, 20]
    steps: ...

  build:
    needs: test
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps: ...
```

---

## 3. Caching

```
MANDATORY:
  ├── Cache dependencies (node_modules, pip, gradle) — saves minutes per run
  ├── Use actions/cache or setup-node with cache: 'npm'
  ├── Cache key must include lock file hash — invalidates on dependency changes
  ├── Cache Playwright browsers separately (they're large)
  └── Set restore-keys for partial cache hits
```

**GOOD**
```yaml
- uses: actions/setup-node@v4
  with:
    node-version: 20
    cache: 'npm'

# Or explicit caching:
- uses: actions/cache@v4
  with:
    path: ~/.npm
    key: ${{ runner.os }}-npm-${{ hashFiles('**/package-lock.json') }}
    restore-keys: ${{ runner.os }}-npm-
```

---

## 4. Secrets Management

```
MANDATORY:
  ├── NEVER hardcode secrets, tokens, or API keys in workflow files
  ├── Use GitHub repository or environment secrets
  ├── Use environment-scoped secrets for deploy workflows (staging vs production)
  ├── Limit secret access: only jobs that need them should reference them
  ├── NEVER echo or log secrets — even accidentally via debug output
  └── Rotate secrets periodically — set reminders
```

**BAD**
```yaml
env:
  API_KEY: sk-abc123  # NEVER DO THIS
```

**GOOD**
```yaml
env:
  API_KEY: ${{ secrets.API_KEY }}
```

---

## 5. Actions Versioning

```
MANDATORY:
  ├── Pin actions to major version: uses: actions/checkout@v4
  ├── For security-critical workflows, pin to SHA: uses: actions/checkout@abc123
  ├── NEVER use @latest or @main for third-party actions
  ├── Review third-party actions before use — check the source
  └── Prefer official actions (actions/*, github/*) over community ones
```

---

## 6. Deployment Workflows

```
MANDATORY:
  ├── Require manual approval for production deploys (environment protection rules)
  ├── Deploy to staging first — production only after staging passes
  ├── Include a rollback step or document the rollback procedure
  ├── Tag releases with version numbers after successful deploy
  ├── Use concurrency groups to prevent parallel deploys
  └── Post-deploy: run smoke tests against the deployed environment
```

**GOOD**
```yaml
deploy-production:
  needs: deploy-staging
  runs-on: ubuntu-latest
  environment:
    name: production
    url: https://app.example.com
  concurrency:
    group: deploy-production
    cancel-in-progress: false
```

---

## 7. Notifications and Artifacts

```
RECOMMENDED:
  ├── Upload test results and coverage as artifacts
  ├── Notify on failure (Slack, email) — don't notify on every success
  ├── Upload build artifacts for deploy jobs to download
  ├── Set artifact retention days (default 90 is often too long)
  └── Use job summaries (echo >> $GITHUB_STEP_SUMMARY) for key metrics
```

---

## 8. Anti-Patterns

```
NEVER:
  ├── on: push without branch filters (triggers on every branch)
  ├── Hardcoded secrets in workflow files
  ├── @latest or @main for actions — pin versions
  ├── Jobs without timeout-minutes
  ├── Skipping cache — wastes minutes on every run
  ├── Deploy to production without staging gate
  ├── Single monolithic workflow file (500+ lines)
  └── Running expensive jobs on PRs from forks without approval
```

---

## GitHub Actions Verification Checklist

- [ ] Workflows named descriptively with specific triggers
- [ ] Branch filters on push triggers
- [ ] Jobs have timeout-minutes set
- [ ] Dependencies cached (npm, pip, etc.)
- [ ] Secrets in GitHub Secrets — never hardcoded
- [ ] Actions pinned to major version or SHA
- [ ] Deploy requires staging → production progression
- [ ] Production deploy has environment protection
- [ ] Concurrency groups prevent parallel deploys
- [ ] Test artifacts uploaded
