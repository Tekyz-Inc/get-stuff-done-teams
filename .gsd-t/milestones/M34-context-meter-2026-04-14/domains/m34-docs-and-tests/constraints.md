# Constraints: m34-docs-and-tests

## Must Follow

- **Docs reflect shipped behavior, not planned behavior**: this domain runs LAST in the wave, after implementation is verified. Every code example in the docs must work when copy-pasted.
- **Run the Pre-Commit Gate on the FULL changeset**: this domain's scope spans README, GSD-T-README, both CLAUDE templates, 3 architecture docs, and 3 integration test files. All must be updated in the same pass per the Document Ripple Completion Gate in CLAUDE.md.
- **Zero external dependencies** in integration tests — use Node's built-in `http` module for the count_tokens stub server, built-in `assert` or the existing test runner (whatever `bin/*.test.js` already uses).
- **Integration tests use tempdirs**: never leave artifacts in the repo; use `os.tmpdir()` + cleanup in afterEach.
- **Gate on docs matching the final implementation**: if during docs pass a discrepancy is found with the code, push the discrepancy back to the owning domain rather than silently re-documenting.
- **Emoji in tables**: per project CLAUDE.md Markdown Tables section, add one extra space after ✅/❌ emoji in any table cells added to README/GSD-T-README.
- **Version bump**: this is the last domain in the wave — include the package.json + CHANGELOG version bump (v2.74.13 → v2.75.10 since this is a feature milestone with breaking changes around task-counter removal).
- **CHANGELOG entry**: add a v2.75.10 entry describing the M34 shipment, the task-counter retirement, and the migration steps for existing users (API key required, run `gsd-t doctor` after upgrade).

## Must Not

- Modify any file listed under another domain's "Owned Files/Directories".
- Ship docs that describe a feature that wasn't actually implemented (verify by reading the code, not by trusting the plan).
- Add new requirements without also adding them to `docs/requirements.md`.
- Skip the integration tests — unit tests alone don't prove the hook + config + token-budget + installer chain hangs together.

## Must Read Before Using

- **All M34 deliverables produced by the other four domains** — READ the final code before writing docs. This is the "docs reflect reality" discipline.
- **Current README Context Meter section (if any)** — check whether prior drafts exist; do not duplicate.
- **Pre-Commit Gate checklist in project CLAUDE.md** — identify every affected doc before starting the ripple pass so nothing is missed.
- **CHANGELOG.md** — read the last 5 entries to match style and level of detail.

## Dependencies

- **Depends on**: ALL other M34 domains. This domain is serialized last in the wave.
- **Depended on by**: none (this is a leaf domain in the dependency graph).

## Integration Checkpoints

- **CP-final**: All three implementation domains (context-meter-hook, context-meter-config, installer-integration, token-budget-replacement) must report their unit tests passing AND have their contracts checked in BEFORE this domain begins its pass.
