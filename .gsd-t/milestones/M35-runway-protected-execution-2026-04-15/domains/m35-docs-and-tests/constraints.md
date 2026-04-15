# Constraints: m35-docs-and-tests

## Hard constraints

1. **Docs-only domain**: This domain does not edit code owned by other M35 domains. It edits documentation, tests (integration-level), templates, version, and memory.
2. **Doc-ripple completion gate**: Per CLAUDE.md, every downstream document must be updated in one pass before reporting done. This domain IS the completion gate for M35.
3. **Historical prose preserved**: M31 references in `progress-archive/`, pre-v2.76 CHANGELOG entries, and the methodology doc's historical narrative are PRESERVED. Grep assertions exclude these paths.
4. **REQ alignment**: Each of REQ-069 through REQ-078 must map to at least one domain's acceptance criteria. Traceability from requirement to implementation is a M35 success criterion.
5. **Goal-backward verify zero findings**: Not "few findings" — zero. Any finding blocks complete-milestone.
6. **Version in exactly 3 places**: `package.json`, `bin/gsd-t.js` (if VERSION constant exists), `.gsd-t/progress.md`. Any other hardcoded version reference is tech debt.

## File boundaries

- **OWNED**: All documentation files, `CHANGELOG.md`, `package.json` version field, progress.md, memory files, `docs/requirements.md`
- **COORDINATED**: `docs/prd-harness-evolution.md` (m35-degradation-rip-out writes the initial draft in Wave 2; this domain does final consistency pass in Wave 5)
- **DO NOT TOUCH**: Any `bin/*.js` code module, any command file's Steps, any test fixture

## Testing

- Integration tests at cross-domain level, not new unit tests (each domain landed its own unit tests)
- Full suite must be green as acceptance gate

## Quality gates that cannot be skipped

- Red Team on T8 (the final verify pass — if anything is missed, M35 doesn't ship)
- Doc-ripple is intrinsic to this domain (it IS the doc-ripple for M35)
