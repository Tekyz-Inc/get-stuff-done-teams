# Contract: cli-build-coverage

Status: STABLE
Version: 2.0.0
Owner: m57-d1-build-coverage-check
Consumers: commands/gsd-t-verify.md (FAIL-blocking gate), `gsd-t build-coverage` CLI

## Purpose

Detect new top-level paths added in a milestone's commit range that no CI
build *input* references — the TimeTracking v1.10.12 failure class (new
`hooks/` dir committed, absent from Dockerfile `COPY`, shipped broken while
verify passed). **False negatives are not acceptable; false positives are.**

## Design mandate — STRUCTURAL PARSE (normative)

> v2.0.0 supersedes the v1.x "heuristic line scan + accepted residual"
> design, which failed Red Team across 5 non-converging cycles
> (BUG-4/6/9/9b): substring/regex-over-raw-text matching cannot distinguish a
> directory name in a build-input position from the same string in prose, so
> every fix spawned a new syntactic variant. See memory:
> `feedback_coverage_check_structural_not_substring.md`.

A path contributes coverage **only when it appears in a build-input
position**, determined by parsing the CI file's structure:

1. **Dockerfile** — a source argument of a `COPY` or `ADD` instruction (all
   tokens except the final destination; flags `--from=` / `--chown=` /
   `--chmod=` are not path tokens). A `COPY --from=<stage> <src> <dest>`
   source IS a build input: a **relative** source (`dist/`) contributes
   coverage for `dist`; an **absolute** source (`/app/dist`) references the
   build-stage image filesystem, not the workspace, so it contributes no
   workspace coverage. A path appearing in `RUN`/`CMD`/`ENV`/`FROM`/a `#`
   comment is **not** a build input. `COPY . .` / `ADD . .` ⇒ `coversAll`.
2. **cloudbuild.yaml** — a value inside a `steps[].args` sequence (flow form
   `args: [ ... ]` or block form `args:` + `- item`). A token in a `#`
   comment, a step `name:`/`id:`, or an `env:` block is **not** a build
   input.
3. **.github/workflows/\*.yml** — a path token inside a
   `jobs.<job>.steps[].run` command, or a `working-directory:` value. A
   token in a step/job/workflow `name:` (plain, quoted, OR multi-line `|`/`>`
   block/folded scalar **and its indented continuation lines**), a `#`
   comment, `uses:`, `if:`, or any non-command position is **not** a build
   input.

`node_modules` is **never** coverage and a `node_modules`-rooted new path is
never gated (it is install output, not shipped source — BUG-7).

**Prohibition (normative).** There is no code path that decides coverage via
`configText.includes(segment)`, a regex over raw config text for the segment
name, or counting an interior path component. Coverage is set membership of a
new top-level segment against the **structurally-extracted build-input path
set**. A reviewer finding such a path-text scan MUST treat it as a contract
violation, not a style nit.

## API

```
checkBuildCoverage({ projectDir, baseRef, headRef, _newPaths }) → {
  ok: boolean,
  missing: string[],          // new top-level paths in no build-input position
  checkedAgainst: string[],   // CI artifacts detected & structurally parsed
  newPaths: string[],         // all new top-level paths in baseRef..headRef
  note?: string               // set when no CI artifacts exist or diff is empty
}
```

- `projectDir` (string, required) — project root.
- `baseRef` / `headRef` (string, optional) — git refs bounding the range;
  default `HEAD~1..HEAD`.
- `_newPaths` (string[], optional, **test seam**) — bypasses
  `git diff --name-only`; the list is collapsed to first top-level segments.
  Not exposed via the CLI.

**Throws `UsageError`** (not in envelope) for unusable git state (no repo,
bad refs, identical refs). The CLI catches it → exit 2. The function never
throws for CI-artifact conditions.

## Exit Codes (CLI)

| Code | Meaning |
|------|---------|
| 0 | `ok:true` — all new paths covered, OR no CI artifacts exist (`note` set) |
| 4 | `ok:false` — ≥1 new top-level path uncovered (`missing[]` non-empty) |
| 2 | usage error (bad args, not a git repo, bad refs) |

## Defensive Behavior

- No git repo / detached HEAD / identical refs → `UsageError` → CLI exit 2.
- No CI artifacts → `ok:true`, `note:"no CI artifacts detected"`, exit 0.
- Empty diff → `ok:true`, `newPaths:[]`, `note:"empty diff"`, exit 0.

## Success Criterion Binding

SC1: a fixture where a new `hooks/` dir is committed but absent from the
Dockerfile `COPY` directives → `ok:false`, `missing` includes `"hooks"`,
CLI exit 4.

## Falsification Corpus (contract-bound regression guarantee)

`test/m57-d1-build-coverage.test.js` MUST include one passing assertion per
frozen fixture under `test/fixtures/m57-build-coverage/bug*/` (committed
56ddded — the Red Team's 5-cycle non-converging set). Each asserts the
genuinely-uncovered `hooks/` returns `ok:false` with `hooks` in `missing[]`:

| Fixture | Vector that must NOT mask the uncovered dir |
|---------|---------------------------------------------|
| `bug4-incidental-token` | interior token `node_modules/husky/hooks/` |
| `bug6-cloudbuild-comment` | dir named in a cloudbuild `#` comment |
| `bug6-workflow-comment` | dir named in a workflow `#` comment |
| `bug7-node-modules-token` | `run: ls node_modules/.bin` |
| `bug9-stepname-prose` | single-line GHA step `name:` |
| `bug9b-name-block-scalar` | `name: \|` block-scalar continuation |
| `bug9b-name-folded-scalar` | `name: >` folded-scalar continuation |

Plus true-negative guards (no over-correction): `copy-dot` (`COPY . .` →
ok), `relative-from` (relative `--from=` source covers `dist`), `no-ci`,
empty-diff, and the absolute-`--from=` non-coverage case. Removing or
weakening any corpus assertion re-opens the defect class M57 exists to
close and is a contract violation.

## Changelog

- **2.0.0** — Re-plan 2026-05-19. Replaces the substring/heuristic-line-scan
  design (v1.0.0–1.0.4, FAILED Red Team, 5 non-converging cycles) with a
  STRUCTURAL parser: Dockerfile COPY/ADD source-arg extraction (incl.
  relative `--from=` source = coverage, absolute `--from=` = image fs),
  cloudbuild `args`-positional, workflow `run`/`working-directory`-positional
  via a block-scalar-aware YAML structure walker. No "accepted residual" —
  the structural design has no documented false-negative case. Falsification
  corpus made a contract-bound guarantee. Prior v1.x changelog removed (it
  documented an abandoned design).
