# Constraints: m36-docs-and-tests

## Must Follow

- **This domain runs LAST.** It depends on every other M36 domain. The plan phase must sequence it into the final wave.
- **Document ripple is atomic.** When updating the 4 command-reference surfaces (README, GSD-T-README, CLAUDE-global template, gsd-t-help.md), all 4 must be updated in the SAME commit — per CLAUDE.md `feedback_auto_complete_milestone` and the Pre-Commit Gate. Never commit a partial ripple.
- **Version bump is also atomic** — `package.json`, `.gsd-t/progress.md`, `CHANGELOG.md`, and any reference to "v2.76.10" in docs all bump together.
- **CHANGELOG entry format matches the M35 and M34 precedents** exactly — Added / Changed / Fixed / Removed / Migration / Propagation sections in that order. Reference the historical v2.76.10 entry for the shape.
- **Requirements IDs continue from M35.** Last M35 REQ was 078; M36 starts at REQ-079. Do not reuse IDs.
- **All prose is present tense and factual.** Describe what the feature DOES, not what the milestone implemented. Example: "`gsd-t unattended` spawns fresh `claude -p` workers in a relay…" — not "M36 added `gsd-t unattended` which…".
- **The contract file's "Verification Status" section is populated** before the milestone can complete. If M36 touches a design contract (it doesn't — no UI), this is moot; if it has other verifiability, fill in the section.
- **`/user:gsd-t-complete-milestone` is invoked by this domain's final task** after docs ripple + tests green + version bump. Do NOT invoke `complete-milestone` before the test count and CHANGELOG delta are reconciled.
- **`npm publish` is a destructive, externally-visible action.** It requires explicit user approval per the Destructive Action Guard. This domain's final task is structured as "prepare v2.77.0 for publish (all artifacts ready), then ASK USER before running `npm publish`." If the user has a pre-committed standing directive (e.g., "publish when M36 done"), honor it — otherwise pause.
- **`/user:gsd-t-version-update-all` runs AFTER `npm publish`** — propagates to registered projects.

## Must Not

- **Touch code in any `bin/gsd-t-unattended*.js` file.** Read-only.
- **Rewrite the contract unilaterally.** Contract changes come from the contract owner (partition-phase author + cross-domain sign-off). Docs-and-tests FINALIZES — fills in TBD fields, runs the editorial pass — but does not add/remove normative statements.
- **Skip the test count reconciliation.** If tests went from 1083 → some-other-number, the CHANGELOG entry MUST cite the exact delta AND the reason (e.g., "1083 → 1167 (+84 net new: supervisor-core 24, watch-loop 12, safety-rails 18, platform 9, handoff-lock 11, integration 10)"). A fuzzy "tests green" claim is a gap.
- **Commit tentatively.** Once docs ripple starts, it runs to completion or rolls back entirely. No "docs updated in 6/8 files, will finish later" — per `feedback_auto_complete_milestone` and CLAUDE.md doc-ripple-completion gate.
- **Introduce emoji into technical prose** (CHANGELOG, requirements, infrastructure) — keep emoji to the Key Features / user-facing README sections where it's already established.
- **Forget to archive.** `complete-milestone` automatically archives to `.gsd-t/milestones/M36-...` — this domain invokes the command but does not hand-craft the archive. Just verify the archive landed correctly before calling the milestone done.

## Must Read Before Using

### Historical CHANGELOG entries for shape reference
- `[2.76.10] - 2026-04-15` — M35 entry; the gold-standard for shape and completeness
- `[2.75.10] - 2026-04-14` — M34 entry

### Existing doc ripple pattern
- M35 Wave 5 decision log entry (2026-04-15 03:15) — cites all 8 doc surfaces touched and the exact pattern
- `docs/methodology.md` existing sections for narrative tone

### `/user:gsd-t-complete-milestone` command file
- Reviews the gate checks before tag, the archive procedure, the version bump rules, the complete-milestone-invokes-status successor hint

### `.gsd-t/contracts/unattended-supervisor-contract.md` v1.0.0
- Final form of the contract — this domain must audit it against what actually shipped and fix any drift before freezing v1.0.0

### `package.json` version + `.gsd-t/progress.md` version header
- Must move in lockstep: 2.76.10 → 2.77.0

## Dependencies

- **Depends on**: ALL 5 other M36 domains being shipped and tested
- **Depends on**: unattended-supervisor-contract.md v1.0.0 authored + reviewed
- **Depended on by**: NONE (terminal domain)
