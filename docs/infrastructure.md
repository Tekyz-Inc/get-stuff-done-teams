# Infrastructure — GSD-T Framework (@tekyzinc/gsd-t)

## Last Updated: 2026-03-22 (M23 — Headless Mode)

## Quick Reference

| Task | Command |
|------|---------|
| Install GSD-T | `npx @tekyzinc/gsd-t install` |
| Check status | `npx @tekyzinc/gsd-t status` |
| Update GSD-T | `npx @tekyzinc/gsd-t update` |
| Update all projects | `npx @tekyzinc/gsd-t update-all` |
| Diagnose issues | `npx @tekyzinc/gsd-t doctor` |
| View changelog | `npx @tekyzinc/gsd-t changelog` |
| Register project | `npx @tekyzinc/gsd-t register` |
| Publish to npm | `npm publish` (runs `npm test` automatically via prepublishOnly) |
| Headless exec | `gsd-t headless <command> [--json] [--timeout=N] [--log]` |
| Headless query | `gsd-t headless query <type>` (no LLM, <100ms) |

## Local Development

### Setup
```bash
# Clone and install
git clone https://github.com/Tekyz-Inc/get-stuff-done-teams.git
cd get-stuff-done-teams

# No npm install needed — zero dependencies
# Test the CLI directly:
node bin/gsd-t.js status
```

### Testing
```bash
# Run automated test suite (205 tests, zero dependencies)
npm test

# Test CLI subcommands manually
node bin/gsd-t.js install
node bin/gsd-t.js status
node bin/gsd-t.js doctor
node bin/gsd-t.js init test-project

# Validate command files exist
ls commands/*.md | wc -l  # Should be 48
ls templates/*.md | wc -l  # Should be 9

# Test new utility scripts
node scripts/gsd-t-tools.js validate
node scripts/gsd-t-tools.js git pre-commit-check

# Test scan visual output
node bin/gsd-t.js scan --export html
# Output: scan-report.html (self-contained, no external deps)

# Test dashboard server
node scripts/gsd-t-dashboard-server.js --port 7433 --detach
# Browser: http://localhost:7433
node scripts/gsd-t-dashboard-server.js --stop
```

### Scripts
| Script | Purpose |
|--------|---------|
| `scripts/gsd-t-heartbeat.js` | Claude Code hook event logger (JSONL output, secret scrubbing) |
| `scripts/npm-update-check.js` | Background npm registry version checker (path-validated) |
| `scripts/gsd-t-fetch-version.js` | Synchronous npm registry fetch (5s timeout, 1MB limit) |
| `scripts/gsd-t-tools.js` | State utility CLI — state get/set, validate, list, git check, template read (M13) |
| `scripts/gsd-t-statusline.js` | Context usage bar + project state for Claude Code statusLine setting (M13) |
| `scripts/gsd-t-event-writer.js` | Structured JSONL event appender CLI — writes to .gsd-t/events/ (M14) |
| `scripts/gsd-t-dashboard-server.js` | Zero-dep SSE server for real-time dashboard — port 7433 (M15) |
| `scripts/gsd-t-auto-route.js` | UserPromptSubmit hook — auto-routes plain text via /gsd in GSD-T projects (M16) |
| `scripts/gsd-t-update-check.js` | SessionStart hook — fetches latest npm version, auto-updates GSD-T (M16) |
| `bin/scan-schema.js` | ORM/DB schema detector + extractor — 7 ORM types (M17) |
| `bin/scan-diagrams.js` | Diagram orchestrator — 6 diagram types, renders to SVG or placeholder (M17) |
| `bin/scan-report.js` | Self-contained HTML scan report generator (M17) |
| `bin/scan-export.js` | Export subcommand — DOCX (pandoc) + PDF (md-to-pdf) stubs (M17) |

## Distribution

### npm Package
- **Registry**: https://www.npmjs.com/package/@tekyzinc/gsd-t
- **Publish**: `npm publish` (requires npm login with Tekyz account)
- **Version**: Managed in `package.json`, synced to `.gsd-t/progress.md`
- **Files shipped**: `bin/`, `commands/`, `scripts/`, `templates/`, `examples/`, `docs/`, `CHANGELOG.md`

### Installed Locations
| What | Where |
|------|-------|
| Slash commands (48 files) | `~/.claude/commands/` |
| Global config | `~/.claude/CLAUDE.md` |
| Heartbeat script | `~/.claude/scripts/gsd-t-heartbeat.js` |
| State utility CLI | `~/.claude/scripts/gsd-t-tools.js` |
| Statusline script | `~/.claude/scripts/gsd-t-statusline.js` |
| Hook configuration | `~/.claude/settings.json` (hooks section) |
| Version file | `~/.claude/.gsd-t-version` |
| Update cache | `~/.claude/.gsd-t-update-check` |
| Project registry | `~/.claude/.gsd-t-projects` |

## Repository Structure

```
get-stuff-done-teams/
├── bin/gsd-t.js        — CLI installer (~1,438 lines, zero dependencies)
├── commands/           — 45 slash command files (41 GSD-T + 4 utility)
├── scripts/            — 5 hook/utility scripts (added gsd-t-tools.js, gsd-t-statusline.js in M13)
├── templates/          — 9 document templates
├── examples/           — Reference project structure
├── docs/               — Methodology + living docs
├── .gsd-t/             — GSD-T state (self-managed)
└── package.json        — npm package config
```

## Headless Mode (M23)

Headless mode enables non-interactive GSD-T execution for CI/CD pipelines and overnight builds.

### headless exec

Wraps `claude -p "/user:gsd-t-{command} {args}"` for unattended execution.

```bash
gsd-t headless verify --json --timeout=1200 --log
gsd-t headless execute --timeout=3600
gsd-t headless wave --json
```

**Flags:**
| Flag | Default | Description |
|------|---------|-------------|
| `--json`        | off    | Output structured JSON envelope |
| `--timeout=N`   | 300s   | Kill process after N seconds |
| `--log`         | off    | Write output to `.gsd-t/headless-{timestamp}.log` |

**Exit codes:**
| Code | Meaning |
|------|---------|
| 0    | success |
| 1    | verify-fail (tests or quality gates failed) |
| 2    | context-budget-exceeded (split the milestone) |
| 3    | error (claude CLI error or process failure) |
| 4    | blocked-needs-human (requires manual intervention) |

**JSON envelope shape (--json flag):**
```json
{
  "success": true,
  "exitCode": 0,
  "gsdtExitCode": 0,
  "command": "verify",
  "args": [],
  "output": "...",
  "timestamp": "2026-03-22T10:00:00.000Z",
  "duration": 42150,
  "logFile": ".gsd-t/headless-1742641200000.log"
}
```

### headless query

Pure Node.js file parsing — no LLM calls, <100ms response.

```bash
gsd-t headless query status     # Version, milestone, phase
gsd-t headless query domains    # Domain list with flags
gsd-t headless query contracts  # Contract file list
gsd-t headless query debt       # Tech debt items
gsd-t headless query context    # Token log summary
gsd-t headless query backlog    # Backlog items
gsd-t headless query graph      # Graph index metadata
```

All queries return JSON to stdout.

### CI/CD Integration

Example workflow files are in `docs/ci-examples/`:
- `github-actions.yml` — GitHub Actions workflow with verify + status gate jobs
- `gitlab-ci.yml` — GitLab CI pipeline with status/verify/report stages

**Quick setup for GitHub Actions:**
```yaml
- name: GSD-T Verify
  env:
    ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
  run: gsd-t headless verify --json --timeout=1200
```

**Quick setup for GitLab CI:**
```yaml
gsd-t-verify:
  script:
    - gsd-t headless verify --json --timeout=1200
  variables:
    ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY}
```

## Context Meter Setup (M34, v2.75.10+)

The Context Meter is a PostToolUse hook that measures real context consumption via the Anthropic `count_tokens` API. It is **required** for the `gsd-t-execute`, `gsd-t-wave`, `gsd-t-quick`, `gsd-t-integrate`, and `gsd-t-debug` session-stop gates to work.

**API key — required**

```bash
# Shell profile (~/.zshrc, ~/.bashrc, ~/.config/fish/config.fish)
export ANTHROPIC_API_KEY="sk-ant-..."

# Verify
echo $ANTHROPIC_API_KEY | head -c 10
```

Get a key at [https://console.anthropic.com](https://console.anthropic.com). Free tier is sufficient — `count_tokens` is billed per call at negligible cost.

**CI/CD**: set `ANTHROPIC_API_KEY` as a secret (`secrets.ANTHROPIC_API_KEY` in GitHub Actions, masked variables in GitLab CI). The existing verify workflow example above already threads the secret through.

**Per-project `.env.local` (optional)**: drop `ANTHROPIC_API_KEY=sk-ant-...` into the project's ignored env file and source it in your shell profile if you need per-project keys.

**Verify with doctor**:

```bash
npx @tekyzinc/gsd-t doctor
```

Expected GREEN output:

```
Context Meter
  ✅ API key set (ANTHROPIC_API_KEY)
  ✅ PostToolUse hook registered in ~/.claude/settings.json
  ✅ scripts/gsd-t-context-meter.js exists
  ✅ .gsd-t/context-meter-config.json loads cleanly
  ✅ count_tokens dry-run: 7 tokens
```

If any check is RED, doctor exits with code 1.

**Config file** — `.gsd-t/context-meter-config.json`:

```json
{
  "enabled": true,
  "apiKeyEnvVar": "ANTHROPIC_API_KEY",
  "modelWindowSize": 200000,
  "thresholdPct": 85,
  "checkFrequency": 1
}
```

**Threshold bands** (M35 v3.0.0 — three bands, lower-bound inclusive):

| Band   | Range    | Orchestrator action                                                              |
|--------|----------|----------------------------------------------------------------------------------|
| normal | 0–69%    | Proceed                                                                          |
| warn   | 70–84%   | Log warning; cue for explicit pause/resume at the next clean boundary            |
| stop   | ≥85%     | Halt cleanly with resume instruction; command refuses to start if runway crosses |

**Zero silent quality degradation.** There is no `downgrade` band and no `conserve` band. Models are **never** swapped at runtime under context pressure — model choice is a plan-time decision made by `bin/model-selector.js`, and quality-critical phases (Red Team, doc-ripple, Design Verify) always run at their designated tier. See `.gsd-t/contracts/token-budget-contract.md` v3.0.0.

**Structural guarantee**: because the runway estimator refuses runs that project past 85% and the stop band fires at 85%, the runtime's 95% native compact is structurally unreachable under healthy operation. `halt_type: native-compact` in `.gsd-t/token-metrics.jsonl` is a defect signal.

**Upgrading from pre-M34**: `gsd-t update-all` runs a one-time task-counter retirement migration in every registered project (deletes `bin/task-counter.cjs`, `.gsd-t/task-counter-config.json`, `.gsd-t/.task-counter-state.json`, and the `.gsd-t/.task-counter` file; writes `.gsd-t/.task-counter-retired-v1` marker). After upgrade you **must** set `ANTHROPIC_API_KEY` — doctor will fail otherwise.

## Runway-Protected Execution (M35)

M35 adds four components on top of the Context Meter. Together they replace graduated degradation with a pre-flight gate + pause/resume model.

### Per-phase model selection — `bin/model-selector.js`

Declarative rules table mapping each phase (`plan`, `execute`, `red-team`, `doc-ripple`, `design-verify`, `qa`, `integrate`, ...) to a default tier (`haiku`|`sonnet`|`opus`). Complexity signals promoted from the task plan (`cross_module_refactor`, `security_boundary`, `data_loss_risk`, `contract_design`) escalate sonnet→opus. Each command file documents its assignments in a `## Model Assignment` block.

Contract: `.gsd-t/contracts/model-selection-contract.md` v1.0.0

### Pre-flight runway estimator — `bin/runway-estimator.js`

Reads historical per-spawn consumption from `.gsd-t/token-metrics.jsonl` via a three-tier query fallback (exact match on `{command, phase, domain}` → command+phase → command) and produces a confidence-weighted projection of end-of-run `pct`. If the projection would cross `STOP_THRESHOLD_PCT = 85`, the command refuses to start — the interactive session exits cleanly and an autonomous headless continuation is auto-spawned. The user never types `/clear`.

### Headless auto-spawn — `bin/headless-auto-spawn.js`

Detached child-process spawn (`child_process.spawn` with `detached:true`, `stdio:['ignore', fd, fd]`, `child.unref()`). Writes `.gsd-t/headless-sessions/{session-id}.json` with session metadata, polls with `process.kill(pid, 0)` liveness probe (timer `.unref()`-ed), marks `status: completed`, and posts a macOS `osascript` notification when done (graceful no-op on non-darwin). `bin/check-headless-sessions.js` renders the read-back banner on the next `gsd-t-resume` / `gsd-t-status`.

Directory: `.gsd-t/headless-sessions/` — one JSON per session, plus optional `{id}-context.json` and log files.

### Per-spawn token telemetry — `.gsd-t/token-metrics.jsonl`

Frozen 18-field JSONL schema, one record per subagent spawn. Written by the orchestrator, consumed by the runway estimator and the token optimizer.

Contract: `.gsd-t/contracts/token-telemetry-contract.md` v1.0.0

Key fields: `timestamp`, `session_id`, `command`, `phase`, `domain`, `task_id`, `model`, `complexity_signals[]`, `input_tokens`, `output_tokens`, `duration_seconds`, `start_pct`, `end_pct`, `halt_type`, `halt_reason`, `exit_code`, `run_type` (`interactive`|`headless`), `projection_variance`.

`halt_type` values: `clean`, `stop-band`, `runway-refuse`, `native-compact` (defect), `crash`.

### Optimization backlog — `.gsd-t/optimization-backlog.md`

Append-only markdown file of recalibration recommendations. `bin/token-optimizer.js` scans the last 3 milestones of telemetry at `complete-milestone` time and appends detected recommendations. Recommendations are **never** auto-applied — the user promotes via `/user:gsd-t-optimization-apply {ID}` or rejects via `/user:gsd-t-optimization-reject {ID} [--reason "..."]`. Rejected items are fingerprinted and cooled down for 5 milestones before re-surfacing.

Detection rules: `demote` (opus phase with ≥90% success, ≥3 volume), `escalate` (sonnet phase with ≥30% failure, ≥5 volume), `runway-tune` (projection vs. actual divergence >15%), `investigate` (per-phase p95 > 2× median, ≥10 volume).

## Metrics CLI — `gsd-t metrics`

Read-only surface onto the token telemetry stream. Backward-compatible with pre-M35 `metrics` output; new flags surface M35 data.

| Flag                  | Output                                                                                 |
|-----------------------|----------------------------------------------------------------------------------------|
| (no flag)             | Task telemetry, process ELO, domain health (pre-M35 behavior)                          |
| `--tokens`            | Per-command / per-phase token usage summary from `.gsd-t/token-metrics.jsonl`          |
| `--halts`             | Count + breakdown of `halt_type` values — flags any `native-compact` as a defect       |
| `--context-window`    | Trailing 20-run window of `end_pct` with runway headroom                               |
| `--cross-project`     | Cross-project ranking (pre-M35, unchanged)                                             |

## `/advisor` escalation convention

When a sonnet-default phase hits a complexity signal that warrants opus (e.g., cross-module refactor detected mid-execution), the command may emit an `/advisor` hook line in its output — a structured suggestion for the orchestrator to escalate the **next** spawn of that phase to opus. This is a plan-time signal, not a runtime swap: the current spawn completes at its assigned tier, and the escalation applies to subsequent work. See `.gsd-t/contracts/model-selection-contract.md` for the hook schema.

## Unattended Supervisor Setup (M36)

The unattended supervisor runs an active GSD-T milestone to completion in a detached OS process — no terminal needed, no human intervention required.

### Quick Start

```bash
# From within an interactive Claude session:
/user:gsd-t-unattended

# From the terminal (detached — returns immediately):
gsd-t unattended --hours=24 --milestone=M36

# Watch current run status (in-session, 270s tick):
/user:gsd-t-unattended-watch

# Request a graceful stop:
/user:gsd-t-unattended-stop
```

### CLI Flags

```
gsd-t unattended [OPTIONS]
  --hours=24              Wall-clock cap in hours (default: 24)
  --max-iterations=200    Worker iteration cap (default: 200)
  --project=.             Project directory (default: cwd)
  --branch=AUTO           Branch to run on; AUTO = current non-protected branch
  --on-done=print         Terminal action: print | merge-commit (merge-commit is v2)
  --dry-run               Preflight only; no spawn
  --verbose               Extra log detail
  --test-mode             Uses stub worker; for CI and smoke tests
```

### Config File (optional)

`.gsd-t/unattended-config.json` — per-project overrides. Absence = hardcoded defaults.

```json
{
  "hours": 24,
  "maxIterations": 200,
  "gutterNoProgressIters": 5,
  "workerTimeoutMs": 3600000,
  "protectedBranches": ["main", "master", "develop", "trunk"],
  "dirtyTreeWhitelist": [".gsd-t/.unattended/*", ".gsd-t/events/*.jsonl"]
}
```

### State Files

| File | Purpose |
|------|---------|
| `.gsd-t/.unattended/supervisor.pid` | Integer PID. Exists only while supervisor is alive. |
| `.gsd-t/.unattended/state.json` | Live state snapshot — status, iter, milestone, lastTick, etc. Full schema in `unattended-supervisor-contract.md`. |
| `.gsd-t/.unattended/run.log` | Append-only worker stdout+stderr. Never truncated during a run. |
| `.gsd-t/.unattended/stop` | Sentinel — touching this file requests a graceful stop. |
| `.gsd-t/.unattended/config.json` | Optional per-project config overrides (same keys as CLI flags). |

### Required Platform Helpers

| Platform | Sleep Prevention | Notifications |
|----------|-----------------|---------------|
| macOS | `caffeinate` (built-in) | `osascript` (built-in) |
| Linux | `systemd-inhibit` or no-op | `notify-send` (install via `apt`/`dnf`) |
| Windows | NOT supported — see `docs/unattended-windows-caveats.md` | no-op |

macOS and Linux work out of the box on standard installs. Windows can run the supervisor but the machine may sleep mid-run.

### Contract

`.gsd-t/contracts/unattended-supervisor-contract.md` v1.0.0 — authoritative state schema, exit-code table, status enum, launch/resume handshakes.

### Troubleshooting

**Supervisor won't start**
- Check `.gsd-t/.unattended/run.log` for error output
- Run `gsd-t unattended --dry-run` to run pre-flight checks without spawning
- Verify no protected branch: `git branch --show-current`

**"Already running" error**
```bash
# Verify supervisor is actually alive:
kill -0 $(cat .gsd-t/.unattended/supervisor.pid) && echo "alive" || echo "stale PID"

# If stale, remove PID file:
rm .gsd-t/.unattended/supervisor.pid

# Or request a graceful stop:
/user:gsd-t-unattended-stop
# (or) touch .gsd-t/.unattended/stop
```

**Watch loop stopped firing**
- Re-invoke `/user:gsd-t-resume` from a fresh session
- Step 0 auto-reattach reads `supervisor.pid` — if the supervisor is still alive, it re-enters the watch loop automatically (no manual steps needed)

**Supervisor crashed mid-run**
- The watch loop detects crash via `kill -0` failure
- Check `.gsd-t/.unattended/run.log` and final `state.json` for diagnostics
- Resume normally with `/user:gsd-t-resume` — the milestone continues from its last checkpoint

---

## Security Notes

- Zero npm dependencies — no supply chain risk
- All file writes check for symlinks first
- Input validation on project names, versions, session IDs, paths
- Heartbeat stdin capped at 1MB
- HTTP requests use HTTPS with timeouts
- Init operations use exclusive file creation (`{ flag: "wx" }`)
