# Constraints: d2-command-file-doc-ripple

## Must Follow

- **Single canonical block**: every replacement uses the exact same bash+node snippet (Pattern A) or the exact same JS snippet (Pattern B) from D2 `scope.md`. No per-command variation — consistency is the whole point.
- Every spawn site ends with a `recordSpawnRow` or `captureSpawn` call. If you see a `Task(...)` call or `claude -p` spawn in a command file without a wrapper call immediately around it, it's a linter failure (D5 enforces).
- **Header migration is lazy + in-place**: D1 `recordSpawnRow` detects the old header (`| … | Notes | Domain | Task | Ctx% |` without Tokens) and rewrites the header + preserves old rows on first write. D2 just relies on that — do not teach command files to migrate headers themselves.
- Every command file touched gets its Decision Log entry in the M41 section of `progress.md` when committed.

## Must Not

- Modify `bin/gsd-t-token-capture.cjs` — D1 owns the module
- Add new command files — M41 is doc-ripple for existing files only
- Write `| N/A |` or `| 0 |` into the Tokens column anywhere (use `—` when usage is absent)
- Silently change a command's step numbering or step labels just because the observability block moved — keep step structure stable, only the observability subsection inside each step changes
- Inline the wrapper logic as bash (`jq` extraction etc.) — always call the module. Inline bash parse-usage was the M40-era mistake we are retiring.
- Rename `token-log.md` or move it — D4 dashboard and D3 backfill both depend on the existing path

## Must Read Before Using

- `bin/gsd-t-token-capture.cjs` (D1 output — read the exported signature before rewriting call sites)
- `templates/CLAUDE-global.md` § Observability Logging — current canonical block (will be rewritten by D2 first)
- `commands/gsd-t-execute.md` — most complex spawn surface, use as the reference conversion
- `.gsd-t/contracts/metrics-schema-contract.md` — confirms the token-log row shape

## Dependencies

- Depends on: D1 (wrapper module must exist and be loadable first)
- Depended on by: D3 (backfill doesn't touch command files but shares the same row format), D4 (dashboard reads what D2 writes), D5 (linter greps these files to verify replacement was mechanical)
