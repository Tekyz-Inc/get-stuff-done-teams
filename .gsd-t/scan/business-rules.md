# Business Rules — 2026-02-07

## Installation & Update Rules

### Install (`doInstall`)
- Creates `~/.claude/commands/` if missing
- Copies ALL `.md` files from `commands/` to `~/.claude/commands/`
- Handles CLAUDE.md: creates new, appends to existing, or skips if GSD-T already present
- Saves version to `~/.claude/.gsd-t-version`

### Update (`doUpdate`)
- **Skip if same version**: Strict string equality `installedVersion === PKG_VERSION`
- **Content-diff copy**: Only overwrites files whose content has changed (byte-for-byte)
- **Backup customizations**: If CLAUDE.md differs from template, backs up with `Date.now()` suffix
- Reports count of skipped (unchanged) files

### Init (`doInit`)
- **Never overwrites**: Skips any file that already exists
- **Token replacement**: `{Project Name}` and `{Date}` substituted globally
- **Date format**: ISO 8601 via `new Date().toISOString().split("T")[0]`
- **Git tracking**: Creates `.gitkeep` in empty directories
- **Project name default**: Falls back to `path.basename(process.cwd())`

## Command Discovery Rules
- **GSD-T commands**: Auto-discovered via `f.startsWith("gsd-t-")` filter on `.md` files
- **Utility commands**: Hardcoded whitelist: `branch.md`, `checkin.md`, `Claude-md.md`
- **Counting**: Reports as `{N} GSD-T + {M} utilities`
- **Missing detection**: Compares expected (package) vs installed (disk) sets

## Doctor Diagnostic Rules
- Node.js >= 16 required (parsed from `process.version`)
- Claude CLI checked via `execSync("claude --version 2>&1")`
- `~/.claude/CLAUDE.md` must contain string `"GSD-T"`
- `settings.json` must be valid JSON (if present)
- Encoding corruption detected via `"â€"` and `"Ã"` substring checks
- Agent Teams detected via `settings.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS === "1"`

## Workflow Rules (from methodology)
- **Phase sequence**: milestone → partition → discuss → plan → impact → execute → test-sync → integrate → verify → complete
- **Solo-only phases**: partition, plan, impact, integrate (need full cross-domain context)
- **Parallelizable phases**: discuss, execute, verify
- **Contracts = source of truth**: Code implements contracts, not vice versa
- **Domain isolation**: No two domains modify the same file
- **State survives sessions**: All state in `.gsd-t/`, resume via `/user:gsd-t-resume`

## Undocumented Rules (logic with no comments or docs)
- `bin/gsd-t.js:225` — Version comparison is strict string, not semver (v2.0.0 !== 2.0.0)
- `bin/gsd-t.js:109` — Utility command detection hardcoded by filename, not discoverable
- `bin/gsd-t.js:425-428` — Status regex is case-sensitive: `/## Status:\s*(.+)/` won't match `## status:`
- `bin/gsd-t.js:144-148` — Content diff uses strict equality, so CRLF vs LF triggers false-positive updates on Windows
- `bin/gsd-t.js:553` — Encoding check patterns are UTF-8 mojibake artifacts, not documented why those specific strings
