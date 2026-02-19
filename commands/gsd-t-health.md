# GSD-T: Health — Validate Project Structure

You are diagnosing the health of a GSD-T project. Check every required file and directory, report findings, and optionally repair missing pieces.

## Step 0: Launch via Subagent (default)

When invoked directly by the user, spawn yourself as a Task subagent for a fresh context window:

```
Task subagent (general-purpose, model: haiku):
"Run the GSD-T health check. Read commands/gsd-t-health.md for your full instructions.
Arguments: {$ARGUMENTS}
Skip Step 0 — you are already the subagent."
```

Return the subagent's output and stop. Only skip Step 0 if you are already running as a subagent.

## Step 1: Determine Mode

If `--repair` appears in $ARGUMENTS, set `REPAIR=true`. Otherwise `REPAIR=false`.

## Step 2: Check Required Structure

Check each item below. Record status as `OK`, `MISSING`, or `INVALID`.

### Root files
| File | Check |
|------|-------|
| `CLAUDE.md` | Exists and non-empty |
| `README.md` | Exists and non-empty |
| `.gsd-t/progress.md` | Exists, has `## Status:` and `## Version:` sections |
| `.gsd-t/backlog.md` | Exists |
| `.gsd-t/backlog-settings.md` | Exists |

### Required directories
| Directory | Check |
|-----------|-------|
| `.gsd-t/contracts/` | Exists |
| `.gsd-t/domains/` | Exists |
| `docs/` | Exists |

### Docs
| File | Check |
|------|-------|
| `docs/requirements.md` | Exists |
| `docs/architecture.md` | Exists |
| `docs/workflows.md` | Exists |
| `docs/infrastructure.md` | Exists |

### Active milestone (if any)
Read `.gsd-t/progress.md` to find active milestone. For each domain listed as active:
- `.gsd-t/domains/{domain}/scope.md` — exists?
- `.gsd-t/domains/{domain}/tasks.md` — exists?
- `.gsd-t/contracts/` — at least one `.md` contract file present?

## Step 3: Additional Checks

1. **Version consistency**: Read `## Version:` from `.gsd-t/progress.md`. If `package.json` exists, compare — they should match.
2. **Status validity**: Read `## Status:` value. Confirm it's one of: `DEFINED`, `PARTITIONED`, `DISCUSSED`, `PLANNED`, `EXECUTED`, `SYNCED`, `INTEGRATED`, `VERIFIED`, `VERIFIED-WITH-WARNINGS`, `VERIFY-FAILED`, `COMPLETED`.
3. **Decision Log**: Confirm `## Decision Log` section exists and has at least one entry.
4. **Contract integrity**: For each `.md` file in `.gsd-t/contracts/`, confirm it's non-empty.
5. **Domain integrity**: For each directory in `.gsd-t/domains/`, confirm at least `scope.md` exists.

## Step 4: Report Findings

Output a health report in this format:

```
GSD-T Health Report
═══════════════════════════════════════════════════════════

Core Files
  ✓ CLAUDE.md
  ✓ README.md
  ✗ .gsd-t/progress.md — MISSING
  ✓ .gsd-t/backlog.md

Directories
  ✓ .gsd-t/contracts/
  ✗ docs/ — MISSING

Docs
  ✓ docs/requirements.md
  ✗ docs/architecture.md — MISSING

Active Milestone: {name | none}
  ✓ .gsd-t/domains/{domain}/scope.md
  ✗ .gsd-t/domains/{domain}/tasks.md — MISSING

Additional Checks
  ✓ Version: 2.27.10 (consistent with package.json)
  ✓ Status: PLANNED (valid)
  ✓ Decision Log: present
  ✗ contracts/api-contract.md — EMPTY

═══════════════════════════════════════════════════════════
Summary: {N} OK  |  {N} missing  |  {N} invalid
Overall: {HEALTHY | DEGRADED | BROKEN}
```

Status thresholds:
- **HEALTHY**: 0 missing, 0 invalid
- **DEGRADED**: 1-3 missing/invalid (non-critical)
- **BROKEN**: 4+ missing/invalid OR progress.md missing OR contracts/ missing

## Step 5: Repair (if --repair)

If `REPAIR=true` and any items are MISSING (not INVALID), create them now:

| Missing item | Repair action |
|--------------|---------------|
| `CLAUDE.md` | Create from `templates/CLAUDE-project.md` (with `{Project Name}` = directory name) |
| `README.md` | Create minimal `# {Project Name}\n\n_No description yet._\n` |
| `.gsd-t/progress.md` | Create from `templates/progress.md` |
| `.gsd-t/backlog.md` | Create from `templates/backlog.md` |
| `.gsd-t/backlog-settings.md` | Create from `templates/backlog-settings.md` |
| `.gsd-t/contracts/` | Create empty directory |
| `.gsd-t/domains/` | Create empty directory |
| `docs/` | Create directory |
| `docs/requirements.md` | Create from `templates/requirements.md` |
| `docs/architecture.md` | Create from `templates/architecture.md` |
| `docs/workflows.md` | Create from `templates/workflows.md` |
| `docs/infrastructure.md` | Create from `templates/infrastructure.md` |
| Domain `scope.md` | Create minimal scope with domain name as heading |
| Domain `tasks.md` | Create minimal task list with `## Tasks\n_No tasks defined yet._` |

After repair, re-run the checks and report the final state.

**Do NOT repair INVALID items** (e.g., empty contracts, bad status values) — flag them for user action.

## Step 6: Next Steps

If HEALTHY → "✅ GSD-T structure is healthy — all required files present."
If DEGRADED with --repair done → "✅ Repaired {N} missing files. Run /user:gsd-t-health again to confirm."
If DEGRADED without --repair → "⚠ Run /user:gsd-t-health --repair to create {N} missing files."
If BROKEN → "🔴 Project structure is broken. Run /user:gsd-t-health --repair or /user:gsd-t-init to rebuild."

$ARGUMENTS
