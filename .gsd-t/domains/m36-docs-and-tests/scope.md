# Domain: m36-docs-and-tests

## Responsibility

Own the end-of-milestone documentation ripple, version bump, release cut, and final test verification for M36. This domain runs last. It takes the 5 code domains' deliverables and:

1. Rewrites the user-facing docs (README, GSD-T-README, infrastructure.md, architecture.md, methodology.md, requirements.md) to describe `gsd-t unattended` as a top-level feature.
2. Updates the 4 command-reference surfaces (GSD-T-README, README, CLAUDE-global template, gsd-t-help.md) to list the 3 new slash commands.
3. Cuts v2.77.0 in `package.json`, `.gsd-t/progress.md`, and CHANGELOG.md with a comprehensive M36 entry.
4. Runs the full test suite and confirms the test count delta is accounted for in CHANGELOG + progress.md.
5. Authors or finalizes the contract(s) for M36 (`unattended-supervisor-contract.md` v1.0.0 — partition kicks this off, docs-and-tests finalizes and annotates after the other domains deliver).
6. Publishes v2.77.0 via `npm publish` + `/user:gsd-t-version-update-all` per project convention.

## Owned Files/Directories

- `README.md` — MODIFIED. New section "Unattended Execution (M36)" explaining the `gsd-t unattended` CLI, the 3 slash commands, the relay model, the 270s watch cadence, the safety rails, the supported platforms, and the known Windows sleep gap. Update the Key Features list and the Commands table.
- `docs/GSD-T-README.md` — MODIFIED. Add unattended subsection under Automation / Wave flow. Update the full command reference table with `unattended`, `unattended-watch`, `unattended-stop`. Update the wave flow diagram if the unattended relay is represented (probably not — it's orthogonal to wave, but cross-reference).
- `docs/architecture.md` — MODIFIED. New "Unattended Supervisor" section in the architecture diagram: detached OS process, state directory, watch-loop relationship, platform abstraction layer. Document the contract location.
- `docs/infrastructure.md` — MODIFIED. New "Unattended Supervisor Setup" section: CLI flags, config file (`.gsd-t/unattended-config.json`), required platform helpers (`caffeinate`, `osascript`, `notify-send`, `claude.cmd`), Windows sleep gap, log locations, troubleshooting.
- `docs/methodology.md` — MODIFIED. New narrative section "From Runway-Protected Execution to Cross-Session Relay (M36)" — explains how M35's single-session runway protection evolved into M36's explicit multi-session relay. This is the "why" companion to M34's context meter and M35's no-silent-degradation narrative.
- `docs/requirements.md` — MODIFIED. New REQ-079..REQ-08N block for M36 functional and non-functional requirements, with traceability to the 6 domains + unattended-supervisor-contract v1.0.0.
- `CHANGELOG.md` — MODIFIED. New top-section entry `[2.77.0] - 2026-04-N` covering Added (unattended binary, 3 slash commands, handoff-lock, safety rails module, platform module, Windows caveats doc, contract), Changed (5 command files drop "Run /clear" STOP block, resume.md auto-reattach, optionally `gsd-t-status` supervisor awareness), Fixed (Phase 0 headless-dispatch P0 — referenced for continuity, not re-explained), Migration notes, Propagation instructions for `version-update-all`.
- `package.json` — MODIFIED. `version: "2.77.0"`.
- `templates/CLAUDE-global.md` — MODIFIED. Commands table updated. New section for unattended supervisor referencing the contract and the 270s tick cadence.
- `templates/CLAUDE-project.md` — MODIFIED if the template mentions long-running unattended execution. Otherwise untouched.
- `commands/gsd-t-help.md` — MODIFIED. New AUTOMATION section entry or extend existing automation with the 3 unattended commands.
- `.gsd-t/contracts/unattended-supervisor-contract.md` — AUTHORED during partition (stubbed), FINALIZED here (all TBD fields resolved, sign-off stamp applied).
- `.gsd-t/progress.md` — MODIFIED. Status → M36 COMPLETE, version → 2.77.0, completed milestones table updated, decision log entries for partition/plan/execute/verify/complete.
- `.gsd-t/milestones/M36-cross-platform-unattended-supervisor-YYYY-MM-DD/` — NEW archive directory at complete-milestone time (created by `gsd-t-complete-milestone`, not by this domain directly — this domain is the one that invokes the complete-milestone command).
- `test/m36-integration.test.js` — NEW (optional). End-to-end integration test for the full unattended loop using a shim `claude` binary that simulates worker responses. Fault-injection scenarios per the plan's testing strategy section.

## NOT Owned (do not modify)

- Any code in `bin/gsd-t-unattended*.js` or `bin/handoff-lock.js` — owned by the respective code domains
- Any slash command file under `commands/gsd-t-unattended*.md` — owned by m36-watch-loop
- `commands/gsd-t-resume.md` Step 0 auto-reattach — owned by m36-watch-loop
- 5 command files with `/clear` STOP replacements — owned by m36-m35-gap-fixes
- `.gsd-t/contracts/headless-auto-spawn-contract.md` — M35 contract, amend only if handoff-lock requires a v1.1.0 bump

## Dependencies

- **Depends on**: ALL 5 other M36 domains being complete (this is the final cleanup/ship domain)
- **Depends on**: `unattended-supervisor-contract.md` v1.0.0 authored in partition
- **Depended on by**: the release itself — v2.77.0 ships because this domain's tasks finish

## Verification Gates

- `npm test` — all tests green, test count delta recorded (baseline 1083 → target 1083 + supervisor-core tests + watch-loop tests + safety tests + platform tests + handoff-lock tests + integration test ≈ 1150+)
- `docs/` grep — no references to "Run /clear" outside of historical prose
- `README.md` / `GSD-T-README.md` — 3 new commands present, Key Features mentions unattended
- `CHANGELOG.md` — v2.77.0 section exists, cites the P0 fix from Phase 0 as context
- `package.json` — version = `2.77.0`
- `.gsd-t/progress.md` — status = M36 COMPLETE, version = 2.77.0, decision log covers the full milestone

## Out of Scope

- User-facing tutorials, screencasts, blog posts — out of v1
- Generating release notes in PR form — `CHANGELOG.md` is the authoritative surface
- Deprecating M35 command patterns beyond the `/clear` STOP replacement — M35 stays intact
- Marketing copy for Tekyz website — out of this milestone's scope entirely
