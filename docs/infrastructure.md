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

**Threshold bands** (lower-bound inclusive):

| Band      | Range       | Orchestrator action                                    |
|-----------|-------------|--------------------------------------------------------|
| normal    | 0–59%       | Proceed                                                |
| warn      | 60–69%      | Log warning, continue                                  |
| downgrade | 70–84%      | Downgrade models for subsequent spawns                 |
| conserve  | 85–94%      | Checkpoint + skip non-essential phases                 |
| stop      | ≥95%        | Halt with resume instruction                           |

**Upgrading from pre-M34**: `gsd-t update-all` runs a one-time task-counter retirement migration in every registered project (deletes `bin/task-counter.cjs`, `.gsd-t/task-counter-config.json`, `.gsd-t/.task-counter-state.json`, and the `.gsd-t/.task-counter` file; writes `.gsd-t/.task-counter-retired-v1` marker). After upgrade you **must** set `ANTHROPIC_API_KEY` — doctor will fail otherwise.

## Security Notes

- Zero npm dependencies — no supply chain risk
- All file writes check for symlinks first
- Input validation on project names, versions, session IDs, paths
- Heartbeat stdin capped at 1MB
- HTTP requests use HTTPS with timeouts
- Init operations use exclusive file creation (`{ flag: "wx" }`)
