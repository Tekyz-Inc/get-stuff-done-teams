# Constraints: m36-safety-rails

## Must Follow

- **Pure functions only.** Every check takes `(state, projectDir)` or `(runLogTail)` and returns `{ ok, reason?, code? }`. No side effects, no console output, no file writes — the main loop decides what to do with the result.
- **Fail closed on ambiguity.** If a check can't determine safety (e.g., `git status` fails, config file is malformed), default to "unsafe" with a clear reason. Better to halt than to run on unknown ground.
- **Whitelist is additive from a sane default.** Users can ADD to the dirty-tree whitelist via `.gsd-t/unattended-config.json`; they cannot remove items from the default set. The default must cover all GSD-T runtime files actually observed to be dirty in real projects.
- **Config file is optional.** If `.gsd-t/unattended-config.json` is absent → use hardcoded defaults. Missing file is NOT an error.
- **Gutter detection reads, does not modify.** It takes the run.log tail as input; it does not re-read the file itself. Keeps it unit-testable with synthetic strings.
- **Blocker sentinel matching is regex-based** with the exact list from `mapHeadlessExitCode` + two additional patterns (`DESTRUCTIVE ACTION REQUIRED`, `user approval needed`). Keep the regex flat, case-insensitive, multiline.
- **Every check's refusal reason is user-actionable.** "Refusing to run on branch `main`" is actionable. "Unsafe state" is not. Write refusal reasons as if they will be shown to a user who walked away 8 hours ago and just came back.
- **Iteration cap and wall-clock cap are independent checks** — either can trigger halt, neither is allowed to silently override the other.

## Must Not

- **Modify `bin/gsd-t-unattended.js`.** Only the main loop's owner (supervisor-core) edits that file.
- **Emit notifications, logs, or user-facing text.** Return a structured result; the main loop decides whether to log, notify, or display.
- **Fork on platform inside safety checks.** If a check needs to distinguish platforms (e.g., `git status` shell-out), either stick to pure Node APIs that work cross-platform, OR call a helper from m36-cross-platform. No `process.platform === 'win32'` branches here.
- **Delete or overwrite `.gsd-t/.unattended/state.json`.** Safety checks are readers only. `validateState` REPORTS corruption; it doesn't auto-heal or recreate the file.
- **Hardcode thresholds in check function signatures.** All thresholds come from `.gsd-t/unattended-config.json` or from the hardcoded defaults object exported alongside the checks. Keep the defaults table the single source of truth.
- **Use async functions.** Supervisor-core is `spawnSync`-driven; staying synchronous keeps integration simple. If a future need arises, add sync wrappers.

## Must Read Before Using

### `bin/gsd-t.js` `mapHeadlessExitCode()` (line ~2605, post-Phase 0)
- Authoritative list of worker exit conditions: 0 success, 1 generic, 2 preflight, 3 timeout, 4 unrecoverable, 5 command-dispatch-failed, 6 reserved (safety rails will claim this), plus string sentinels for verify-failed, context-budget-exceeded, blocker.
- Safety rails' `detectBlockerSentinel` DUPLICATES some of these checks intentionally — defense in depth against map bugs. Must keep the pattern list in sync with `mapHeadlessExitCode` over time (use a shared constant if possible, or document the duplication in the contract).

### `.gsd-t/contracts/unattended-supervisor-contract.md` v1.0.0
- Exit-code table (safety rails' codes must align)
- Dirty-tree whitelist canonical list (this domain owns the default, the contract documents it)
- state.json schema (`validateState` asserts against this)

### Existing GSD-T runtime files that CAUSE real dirty trees
- Cross-check with current `git status --porcelain` on real projects:
  - `.gsd-t/events/*.jsonl` (event stream — changes on every command)
  - `.gsd-t/token-log.md` (appended every subagent spawn)
  - `.gsd-t/token-metrics.jsonl` (appended every subagent spawn, M35+)
  - `.gsd-t/.context-meter-state.json` (written by PostToolUse hook, every tool call)
  - `.gsd-t/heartbeat-*.jsonl` (M14+ heartbeat enrichment)
  - `.gsd-t/.unattended/*` (this milestone's own runtime files — obviously whitelisted)
  - `.claude/settings.local.json*` (Claude Code local overrides)
- If any user ACTUALLY wants these files tracked in git, the whitelist must still cover the hot runtime files; tracked hot files are an anti-pattern that the supervisor should refuse regardless.

### `detectGutter` design notes
- "Progress" = a new entry in `.gsd-t/progress.md` Decision Log, detected by line count increase AND by checksum change on the Decision Log section specifically (to distinguish meaningful edits from trivial whitespace).
- "File thrash" needs git diff data — implement via `git diff --name-only HEAD~1 HEAD` per iteration snapshot. Cheap and deterministic.

## Dependencies

- **Depends on**: m36-supervisor-core (state.json schema, loop contract)
- **Depends on**: unattended-supervisor-contract.md v1.0.0
- **Depended on by**: m36-supervisor-core (main loop imports checks between workers)
- **Depended on by**: m36-docs-and-tests (safety behavior and config file are documented surface)
