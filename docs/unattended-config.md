# Unattended Supervisor — Configuration File

**File**: `.gsd-t/.unattended/config.json` (optional, per-project)
**Contract reference**: `.gsd-t/contracts/unattended-supervisor-contract.md` §13
**Loader**: `bin/gsd-t-unattended-safety.js` → `loadConfig(projectDir)`
**Consumer**: `bin/gsd-t-unattended.js` (supervisor entrypoint)

The unattended supervisor reads an optional JSON config file at
`.gsd-t/.unattended/config.json`. If present, its fields override the
hardcoded defaults. If absent, the supervisor runs with the defaults below.
Malformed JSON fails the launch with exit code 2 (preflight-failure) — the
supervisor never silently falls back on a broken config.

## Precedence

From highest to lowest:

1. **CLI flags** passed to `/user:gsd-t-unattended` (e.g. `--hours=48`)
2. **Environment variables** (`GSD_T_HOURS`, `GSD_T_MAX_ITERATIONS`, etc.)
3. **`.gsd-t/.unattended/config.json`** fields
4. **Hardcoded defaults** in `bin/gsd-t-unattended-safety.js` → `DEFAULTS`

A CLI flag always wins. An env var beats the config file. The config file
beats the built-in defaults. Missing fields fall through to the next level
individually — a config with only `protectedBranches` still uses the default
`hours`, `maxIterations`, etc.

## Schema

```json
{
  "hours": 24,
  "maxIterations": 200,
  "protectedBranches": ["main", "master", "develop", "trunk", "release/*", "hotfix/*"],
  "dirtyTreeWhitelist": [
    ".gsd-t/heartbeat-*.jsonl",
    ".gsd-t/.context-meter-state.json",
    ".gsd-t/events/*.jsonl",
    ".gsd-t/token-metrics.jsonl",
    ".gsd-t/token-log.md",
    ".gsd-t/.unattended/*",
    ".gsd-t/.handoff/*",
    ".claude/settings.local.json",
    ".claude/settings.local.json.bak*"
  ],
  "gutterNoProgressIters": 5,
  "workerTimeoutMs": 3600000
}
```

### Field reference

| Field | Type | Default | Purpose |
|---|---|---|---|
| `hours` | number | `24` | Wall-clock cap in hours. Supervisor exits with code 6 (gutter) once `wallClockElapsedMs >= hours * 3600 * 1000`. |
| `maxIterations` | integer | `200` | Iteration cap. Supervisor exits with code 6 once `iter >= maxIterations`. |
| `protectedBranches` | string[] | `["main","master","develop","trunk","release/*","hotfix/*"]` | Branches where the pre-launch guard refuses to spawn. Glob patterns supported (`*`, `**`, `?`). Empty array = no branch protection. |
| `dirtyTreeWhitelist` | string[] | (see defaults) | Files that can be dirty without triggering the clean-worktree refusal. Glob patterns supported. Non-whitelisted dirty files cause exit code 8. |
| `gutterNoProgressIters` | integer | `5` | Lookback window for the no-progress gutter detector. Larger = less sensitive. |
| `workerTimeoutMs` | integer | `3600000` (1h) | Hard wall-clock timeout for a single `claude -p` worker iteration. Exceeding this causes worker SIGTERM + exit code 3. |

## Common Overrides

### Solo project — commit directly to main

For projects where you're the only contributor and main is your working
branch, disable the protected-branch guard:

```json
{
  "protectedBranches": []
}
```

The safety rail still runs, but with an empty list nothing matches, so the
guard always allows. The Destructive Action Guard, blocker sentinels, caps,
and Red Team are all still active — you're only opting out of one specific
check.

### Long overnight runs

Raise the caps for multi-day unattended milestones:

```json
{
  "hours": 72,
  "maxIterations": 600
}
```

### Extra-noisy project

If your project writes logs or caches outside the default whitelist and you
don't want to commit or stash them before each run:

```json
{
  "dirtyTreeWhitelist": [
    ".gsd-t/heartbeat-*.jsonl",
    ".gsd-t/.context-meter-state.json",
    ".gsd-t/events/*.jsonl",
    ".gsd-t/token-metrics.jsonl",
    ".gsd-t/token-log.md",
    ".gsd-t/.unattended/*",
    ".gsd-t/.handoff/*",
    ".claude/settings.local.json",
    "logs/**",
    "tmp/**",
    "*.local.cache"
  ]
}
```

Whitelist is a replacement, not an append. If you override it, restate the
defaults you want to keep.

## Validation

The loader in `bin/gsd-t-unattended-safety.js` merges field-by-field. Only
the fields you set are overridden — everything else keeps its default. If
the file exists but isn't valid JSON, the launcher aborts with:

```
[gsd-t-unattended] preflight-failure: safety-rails: malformed JSON in
.gsd-t/.unattended/config.json: <parse error>
```

and exits with code 2. The PID file, state file, and run log are never
written on a preflight failure.

## Git

`.gsd-t/.unattended/` is in the dirty-tree whitelist, so you can either:
- **Commit the config** — makes it part of the project's canonical setup
- **Gitignore the config** — treat it as a per-developer preference

Both work. There's no preferred choice — it depends on whether your team
wants a uniform cap across machines or lets each developer tune their own.
