# Security Audit — 2026-04-16 (Scan #11)

GSD-T is a developer-tooling package distributed via npm with **zero runtime
dependencies**. Threat surface is narrow: local file I/O, child-process invocation
(git, claude, node, playwright, tree-sitter binaries, npm), and two localhost-bound
HTTP servers (dashboards). No network listeners that bind to public interfaces, no
auth tokens issued, no DB.

## Critical (fix immediately)

_None new in Scan #11._

(Note: the previously-tracked **TD-097 / SEC-C01** — command injection in
`bin/graph-query.js` `grepQuery()` via `params.entity` — is carried forward from
Scan #10 in the archive at `.gsd-t/techdebt_2026-03-19.md`. Confirm fix status before
the next milestone closes.)

## High (fix soon)

### SEC-H01 — `runway-estimator.js` still requires/uses `ANTHROPIC_API_KEY` as if it were mandatory
- File: `bin/runway-estimator.js`, `bin/runway-estimator.cjs`
- After v3.11.11 the context meter no longer needs the key, but `runway-estimator`
  was not audited in the same change. If a user follows the stale "you must set
  `ANTHROPIC_API_KEY`" instruction in CHANGELOG.md / README.md / docs and exports a
  key, it is now used **only** by runway-estimator (and possibly a few telemetry paths)
  — vs the broad "this is required for context-meter" framing. Risk: users assume the
  key is for measurement and don't realize it gates a separate pre-flight estimator.
- Remediation: doc-ripple every reference to align with v3.11.11 reality (see
  Quality TD-103); if runway-estimator should also drop the requirement, do that as a
  follow-up.
- Severity: HIGH (documentation security — wrong mental model leads to misconfigured
  trust boundaries).

### SEC-H02 — Test file `scripts/gsd-t-context-meter.test.js` references `_countTokens` injection that no longer exists
- File: `scripts/gsd-t-context-meter.test.js` (lines 108, 130, 152, 178, 209, 220, 358)
- 7 tests fail because `runMeter()` no longer accepts a `_countTokens` injection (the
  whole API path was deleted in v3.11.11 in favor of `_estimateTokens`).
- **Why this is a security item, not just a quality one**: the broken tests cover the
  exact paths that handle missing API key, API timeout, API failure, fail-open, and
  the "log never contains message content" privacy invariant. A failing/skipped privacy
  test is a real risk — if the `estimate-tokens.js` code path were to start logging
  message content, no test would catch it because the corresponding assertion is in a
  test that fails on import-time API mismatch, not on the privacy invariant itself.
- Remediation: rewrite the 7 tests to inject `_estimateTokens` and target the local
  estimator's behavior, including a test that the new code path also never logs
  content. (The `tokens=42`-vs-`tokens=8` discrepancy in test #11 confirms the fixture
  numbers were not updated for the new estimator output.)
- Severity: HIGH (privacy-test regression).

## Medium (plan to fix)

### SEC-M01 — Two dashboard servers bind to localhost ports without auth
- Files: `scripts/gsd-t-dashboard-server.js` (port 7433), new
  `scripts/gsd-t-agent-dashboard-server.js` (port 7434).
- Carried debt (`TD-090` in archive — original was 7433 only). The new agent dashboard
  doubles the surface.
- Localhost-only is reasonable for a dev tool, but multi-user macOS/Linux machines
  share `127.0.0.1` between users — a co-tenant could read events/heartbeat/context-meter
  state via the SSE stream.
- Remediation: bind to `127.0.0.1` only (verify in code), add a one-time auth token
  printed at startup that the HTML page must echo back, or document the trust model
  explicitly in `infrastructure.md`.
- Severity: MEDIUM.

### SEC-M02 — Stale documentation tells users to export `ANTHROPIC_API_KEY` — risk of key paste in shared docs
- Files: README.md (10 hits), docs/infrastructure.md (12), docs/architecture.md (4),
  docs/methodology.md (multiple), CHANGELOG.md (multiple).
- The instructions say "free tier is sufficient — `count_tokens` is inexpensive" and
  show an `export ANTHROPIC_API_KEY="sk-ant-..."` snippet. Post-v3.11.11 these are
  obsolete: the count_tokens path is removed. Users who follow the stale instructions
  may copy keys into shared shell-init files thinking they need to.
- Remediation: doc-ripple — either remove all references or move to a clearly labeled
  "Optional: for runway estimator and telemetry — not required by context meter"
  section.
- Severity: MEDIUM (mis-instruction → unnecessary credential exposure).

### SEC-M03 — `bin/scan-export.js` and `bin/scan-renderer.js` still use `execSync` with string interpolation
- Carried debt (TD-084 in archive). Confirm scope hasn't grown.
- Remediation: switch to `execFileSync` with array args.

## Low (nice to have)

### SEC-L01 — 76 `heartbeat-*.jsonl` files clutter `.gsd-t/`
- Gitignored (verified) — not a leak risk, but each file contains session telemetry
  that may include task names/file paths. If a user accidentally tarballs `.gsd-t/` to
  share progress with a teammate, this pile travels with it.
- Remediation: add a `gsd-t doctor` hint or a session-end cleanup step that rotates
  heartbeats >30 days old into `.gsd-t/heartbeat-archive/` (or deletes them).

### SEC-L02 — `bin/gsd-t-unattended.js` uses `execSync` for cross-platform queries
- Carried context. Already uses array-arg form for most calls (verified
  `gsd-t-unattended-platform.js:132`, `:212`, `:247`, `:332`, `:342`, `:354`); audit
  remaining `execSync` site at `gsd-t-unattended.js:252` for input sanitization.

### SEC-L03 — No SRI hashes on dashboard CDN resources
- Carried debt (TD-095, TD-096 in archive). New `gsd-t-agent-dashboard.html` should be
  audited for the same.

## Dependency Audit

```
$ npm audit
npm error code ENOLOCK
npm error audit This command requires an existing lockfile.
```

- **No `package-lock.json`** in the repo. With zero declared dependencies this is fine
  in production (nothing to lock), but it disables `npm audit` as a routine check in CI.
- Recommendation: generate a lockfile in CI (`npm i --package-lock-only`) and run audit
  there — even with zero deps it would catch any future dependency added without going
  through the zero-dep policy review.

## Secret Management
- No `.env*` files in the repo (verified — only the `.env*` rule in `.gitignore`).
- No hardcoded credentials found in `bin/` or `scripts/`. The 10 files matched by the
  initial grep all reference `password|secret|api_key|token|credential` as identifier
  strings (config field names, telemetry tags) — not literal values.
- Config-loader API-key leak guard (`bin/context-meter-config.cjs`) actively rejects
  fields that look key-shaped — strong positive control.

## CORS / CSP / Rate Limiting
- N/A — no public HTTP surface. Localhost dashboards do not implement CSP (carried
  TD-096); low priority while local-only.

## File Upload
- N/A.
