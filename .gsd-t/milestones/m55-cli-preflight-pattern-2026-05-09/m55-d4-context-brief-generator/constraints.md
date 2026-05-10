# Constraints: m55-d4-context-brief-generator

## Must Follow

- **Zero runtime deps** — only Node built-ins (`fs`, `path`, `child_process`, `crypto`). Mirror D1 / `parallelism-report.cjs` discipline.
- **Pure** — brief generation reads filesystem and `git` state; never spawns LLMs, never mutates anything except `.gsd-t/briefs/{spawnId}.json`.
- **Deterministic / idempotent-join** — same `(projectDir, kind, domain, spawnId, sourceMtimes)` → byte-identical brief. Sort all arrays. Stable JSON keys.
- **Schema-versioned** — `schemaVersion: "1.0.0"` at the top level. Contract documents bump rules.
- **Per-kind file** — adding a new kind is a single-file change in `bin/gsd-t-context-brief-kinds/`. Registry is a directory scan, not a switch.
- **Size budget** — each brief targets ≤2k JSON bytes. Kind collectors that exceed must summarize (e.g., contract file → `{ path, status, sha256-prefix }`, NOT `{ path, fullText }`).
- **Freshness via mtime hash-stamp** — every source file the brief references is recorded with its mtime; verify-time check fails-open (warn) by default, fail-closed if `--strict` flag passed.
- **Fail-open default** — a missing optional source file (e.g., no Figma URL for non-design kinds) yields a brief field of `null`, never a crash. Required-source absence (e.g., domain dir doesn't exist) yields a structured error object the caller can decide to fail-closed on.
- **`captureSpawn` exemption** — brief generation does not spawn LLMs, so `bin/gsd-t-token-capture.cjs` does not apply. Document this explicitly in `context-brief-contract.md`.
- **`.gsd-t/briefs/` is gitignored** — briefs are per-spawn ephemera, not committed artifacts.

## Must Not

- Modify any file outside the Owned scope above
- Spawn LLM children (`claude -p`, `Task(...)`)
- Take a runtime dependency
- Inline kind logic into `bin/gsd-t-context-brief.cjs` — every kind is a separate file
- Reach into `commands/` or `bin/gsd-t.js` (D5's job)
- Inline raw contract / CLAUDE.md text into the brief — summarize and hash-stamp
- Crash on missing optional inputs — fail-open + structured `null` field

## Must Read Before Using

The execute agent for D4 must read these files BEFORE writing code:

- **`bin/journey-coverage.cjs`** — pattern for one-shot detector libraries that ship as both lib + CLI; D4's library is structurally a sibling.
- **`bin/parallelism-report.cjs`** — envelope idiom + zero-dep style.
- **`.gsd-t/contracts/parallelism-report-contract.md`** — sister contract to model `context-brief-contract.md` after.
- **`bin/headless-auto-spawn.cjs`** — see how the spawn scaffold currently injects context; D4's brief replaces a chunk of that.
- **The 6 subagent protocols** in `templates/prompts/` — `qa-subagent.md`, `red-team-subagent.md`, `design-verify-subagent.md` — D4 reads them to author each `kind`'s collector accurately. D4 does NOT modify these (D5 does).
- **Existing domain scope/constraints/tasks files** — D4 reads the structure once to confirm the `execute` kind collector reproduces the right slice.

D4 is prohibited from treating any of these as black boxes — read the listed sections before depending on shape.

## Dependencies

- Depends on: nothing internal — independent (Wave 1 candidate, runs parallel with D1 and D3)
- Depended on by: D5 (wires the brief into command Step 1 + subagent protocols)
