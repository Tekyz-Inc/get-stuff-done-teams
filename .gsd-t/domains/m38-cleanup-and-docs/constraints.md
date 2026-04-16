# Constraints: m38-cleanup-and-docs

## Must Follow

- **Terminal domain — runs LAST** in Wave 2 (after Domains 3, 4 finish, since their command-file changes inform doc content)
- **Document Ripple Completion Gate** (CLAUDE-global.md mandate): identify the FULL blast radius BEFORE starting. List every file that needs the change. Complete ALL updates in one pass. Don't update 5 of 12 files and report done.
- **Pre-Commit Gate** (CLAUDE-global.md mandate) on the COMPLETE changeset
- **Apply markdown emoji-spacing rule** to all touched tables (one extra space after emoji)
- **CHANGELOG entry MUST include** the explicit "M37 right about symptom, wrong about elevation; M38 fixes cause" note. This addresses the flip-flop optics risk noted in M38 risks.
- **Command counting**: when deleting 7 commands (4 self-improvement from this domain + 3 conversational from Domain 4), update `bin/gsd-t.js` count + `test/filesystem.test.js` count + `package.json` description string + README count + GSD-T-README count + CLAUDE-global.md count
- **Version bump 3.11.11 → 3.12.10**: minor bump (M38 is a feature milestone, not breaking). Patch resets to 10 per CLAUDE-global Versioning section.
- npm publish is **user-gated** — do not run `npm publish` without explicit user confirmation
- `gsd-t version-update-all` is **user-gated** — do not run without explicit confirmation

## Must Not

- Modify any code in `bin/` or `scripts/` or `commands/` outside this domain's owned scope
- Modify other domains' contracts (only the ones this domain owns: deleted contracts, supervisor contract update)
- Skip updating `~/.claude/CLAUDE.md` (it's synced via update-all, not edited directly)
- Batch doc updates for "later" — same commit as code changes per CLAUDE-global.md mandate
- Add commands — this domain only deletes
- Reintroduce deleted machinery in docs (e.g., describing the old three-band model as current)

## Dependencies

- **Depends on**: ALL other domains (1, 2, 3, 4) complete. This is the terminal domain.
- **Depended on by**: nothing — this is the milestone exit.

## Must Read Before Using

- `templates/CLAUDE-global.md` — full file. The biggest doc edit target.
- `templates/CLAUDE-project.md` — full file
- Project `CLAUDE.md` — full file (current state at M37/v3.11.11 baseline)
- `docs/architecture.md`, `docs/workflows.md`, `docs/infrastructure.md`, `docs/methodology.md`, `docs/requirements.md` — full each
- `README.md`, `GSD-T-README.md`, `CHANGELOG.md` — full each
- `commands/gsd-t-help.md` — full file
- `commands/gsd-t-complete-milestone.md` — find Step 14 optimizer invocation; remove
- `commands/gsd-t-backlog-list.md` — find `--file` flag; remove
- `commands/gsd-t-status.md` — find optimization-backlog pending count Step 0.5; remove
- `commands/gsd-t-resume.md` — find optimization-backlog references if any; remove
- `bin/qa-calibrator.js` — full file before deletion; confirm zero callsites in non-deleted files
- `bin/token-optimizer.js` — full file before deletion; confirm only deleted commands consume it
- `bin/gsd-t.js` — find command-counting logic and propagation list; update for 7 fewer commands
- `test/filesystem.test.js` — current command count assertion
- All deleted commands (`gsd-t-optimization-apply.md`, `gsd-t-optimization-reject.md`, `gsd-t-reflect.md`, `gsd-t-audit.md`) — read before deleting; understand what they did so docs don't reference them
- `.gsd-t/contracts/headless-default-contract.md` (NEW from Domain 1) — to fold the deleted contracts into
