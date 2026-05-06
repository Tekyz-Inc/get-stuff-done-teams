# Constraints: m50-gates-and-specs

## Must Follow

- The spawn-gate MUST short-circuit cheaply on non-UI / non-testing commands. Hot-path overhead per spawn ≤ 10ms when no install is needed (one `hasUI()` walk + one `hasPlaywright()` config-existence check, both file-system-only).
- The spawn-gate's `installPlaywright` invocation MUST be wrapped in a single-flight lock so concurrent spawns on the same project don't race two installs. Reuse the existing handoff-lock (`bin/handoff-lock.cjs`) or add a dedicated `playwright-install.lock` if it interferes with the spawn handoff semantics — confirm at the integration checkpoint.
- Install-failure path MUST surface as `mode: 'blocked-needs-human'` in the headless session-state file (read by `gsd-t-resume` Step 0 and the read-back banner). Operator sees the failure on next message; nothing is silently dropped.
- The pre-commit hook MUST be opt-in. Zero side effects on a fresh clone — only activates when `gsd-t doctor --install-hooks` (or future equivalent) writes the `.git/hooks/pre-commit` symlink. Other repos with their own pre-commit infrastructure are unaffected.
- Pre-commit hook MUST fail-open on configuration errors (missing `.last-playwright-pass`, corrupt timestamp). A broken hook is worse than a permissive one — never block commits because the hook itself is misconfigured.
- E2E specs MUST be FUNCTIONAL tests, not LAYOUT tests (per `~/.claude/CLAUDE.md` §E2E Test Quality Standard). Each assertion must verify state-changed / data-flowed / content-loaded / widget-responded — never just `isVisible()` / `toBeAttached()` against an empty backbone.
- E2E specs MUST clean up after themselves: any dashboard server spawned for a spec is killed before the spec exits (per `~/.claude/CLAUDE.md` §Playwright Cleanup). Use `test.afterEach` / `test.afterAll` hooks; never leave port 7433-7532 orphaned.
- Each spec's failure message MUST name the M48/M49 bug it regression-tests (e.g., `expected('M48 Bug 2: per-frame timestamps')`). On future failure, the operator immediately knows what regressed.

## Must Read Before Using (Black Boxes)

- `bin/headless-auto-spawn.cjs::autoSpawnHeadless()` — D2 inserts the gate BEFORE the existing `spawn()` call but AFTER `acquireHandoffLock()`. Read the existing exit-code semantics (M49 added `_probeDashboardLazy`) and the `writeSessionFile` payload shape so `mode: 'blocked-needs-human'` interleaves correctly with the existing `mode` enum.
- `bin/handoff-lock.cjs` (referenced from headless-auto-spawn) — understand its lock-key shape before reusing it for `installPlaywright` single-flight.
- `scripts/gsd-t-transcript.html` (~~700 lines after M48) — the M47 redesign, M48 rendering fixes, M49 lazy banner. Do NOT modify; specs assert against its rendered output.
- `scripts/gsd-t-dashboard-server.js` — `handleTranscriptsList`, `handleTranscriptPage`, `handleMainSession`, `handleSpawnTranscript`, `_escapeHtml`. Specs query these routes; need to know the response shape and `__PROJECT_NAME__` substitution semantics (M48 Bug 1 fix in `replace` function-form).
- `~/.claude/CLAUDE.md` — Playwright Readiness Guard section + Pre-Commit Gate section. The doc-ripple must replace prose with code-references without losing the operator-facing intent.

## Must Not

- Modify `bin/playwright-bootstrap.cjs` or `bin/ui-detection.cjs` (D1 owns).
- Re-implement `hasPlaywright`, `hasUI`, or `installPlaywright` — always import from D1.
- Add `@playwright/test` to `dependencies` in `package.json`. It MUST go in `devDependencies` only — installer's zero-runtime-dep invariant.
- Land specs that pass on an empty HTML page with the right element IDs. Layout-only specs are explicit failures.
- Land the spawn-gate before D1's CLI wiring lands at the integration checkpoint. The gate imports D1; landing in reverse order produces a `MODULE_NOT_FOUND` exit on the first spawn.

## Dependencies

- **Depends on**: D1 (m50-bootstrap-and-detection) — D2 imports `hasPlaywright`, `hasUI`, `installPlaywright` from `bin/playwright-bootstrap.cjs` + `bin/ui-detection.cjs`. **D2 cannot start until D1 reaches the cross-domain integration checkpoint** (end of D1's CLI wiring).
- **Depended on by**: nothing inside M50 — D2 is the terminal domain. Doc-ripple at end of D2 closes M50.
