# Contract: cli-build-coverage

Status: STABLE
Version: 1.0.4
Owner: m57-d1-build-coverage-check
Consumers: commands/gsd-t-verify.md (FAIL-blocking gate), `gsd-t build-coverage` CLI

## Purpose

Detect new top-level paths added in a milestone's commit range that no CI build
artifact references — the TimeTracking v1.10.12 failure class (new `hooks/` dir
committed, absent from Dockerfile `COPY`, shipped broken while verify passed).

## API

```
checkBuildCoverage({ projectDir, baseRef, headRef, _newPaths }) → {
  ok: boolean,
  missing: string[],          // top-level paths not referenced by any CI artifact
  checkedAgainst: string[],   // which CI artifacts were detected & scanned
  newPaths: string[],         // all new top-level paths in baseRef..headRef
  note?: string               // set when no CI artifacts exist or diff is empty
}
```

- `projectDir` (string, required) — project root.
- `baseRef` / `headRef` (string, optional) — git refs bounding the milestone
  commit range. **Default when omitted**: `HEAD~1..HEAD`. (Plan phase MAY refine
  to a milestone-tag heuristic; the fallback stays `HEAD~1..HEAD`.)
- `_newPaths` (string[], optional, **test seam**) — when provided, bypasses
  `git diff --name-only` entirely and uses this list as the set of changed
  file paths. Callers collapse to top-level segments via the same helper.
  Intended for unit tests; not exposed via the CLI.

**Throws `UsageError`** (not returned in envelope) when git state is unusable:
no git repo, bad refs, or identical baseRef/headRef. The CLI catches this and
exits 2. The `checkBuildCoverage` function itself never throws for CI-artifact
conditions — those are expressed in the return envelope.

## Detection Rules — a new top-level path is "covered" if referenced by ANY of:

1. `Dockerfile` — a `COPY` or `ADD` directive whose source path includes the
   top-level segment (line-based scan). `COPY --from=` (multi-stage image copy)
   is excluded — those reference image layers, not workspace paths.
2. `cloudbuild.yaml` — appears in any `steps[].args` or artifact/copy path
   (line/regex path-segment scan; no YAML lib).
3. `.github/workflows/*.yml` — appears as a path segment in any workflow file
   (line/regex path-segment scan; no YAML lib).

`COPY . .` (or `ADD . .`) sets `coversAll:true` → `missing` is always empty
regardless of what top-level paths appear in the diff.

The parsers for cloudbuild.yaml and workflow YAML use a heuristic line scan.

**Comment-strip (precedence: applied before token extraction).** Each line is
first passed through an unquoted-comment stripper: a left-to-right scan tracks
single-quote / double-quote / backtick state, and the first `#` encountered
while **not** inside a quote — and that is either at the start of the line or
immediately preceded by whitespace (YAML's comment rule) — terminates the line.
Everything from that `#` to end-of-line is discarded before any path token is
extracted. A `#` inside a quoted string, or glued directly to a non-space
character (e.g. a URL fragment / YAML anchor), is **not** treated as a comment
and is left intact. Rationale: a CI-file comment is pure prose, never a build
input. A comment that merely *mentions* a directory (e.g.
`# NOTE: hooks/ are installed by husky postinstall`) must never register that
directory as "covered" — doing so masked a genuinely-uncovered new top-level
dir (the TimeTracking v1.10.12 failure class via the secondary heuristic;
M57 BUG-6). This closes the single most common real false-negative vector
while staying library-free.

**GitHub Actions descriptive `name:` label exclusion (workflow YAML only;
precedence: applied before token extraction, alongside comment-strip).** When
scanning `.github/workflows/*.yml`, a line whose YAML key is exactly `name`
— a workflow `name:`, a job `name:`, or a step `- name:` — is a
**descriptive display label**, never a build input. Its value is discarded
before any path token is extracted (matched as `^\s*(?:-\s+)?name\s*:` after
comment-strip). Rationale: a step `name:` is pure human-readable prose,
structurally and semantically identical to a comment — and comments are
already excluded. Naming a CI step after the directory it sets up
(`- name: Set up hooks/ directory`) is an extremely common, idiomatic
workflow-authoring pattern; counting that prose token as coverage masked a
genuinely-uncovered new top-level dir (the TimeTracking v1.10.12 failure class
via the secondary heuristic; M57 BUG-9 — the same forbidden false-negative
class the BUG-6 comment-strip fix narrowed but did not fully close). The
exclusion is keyed strictly off the `name` key: `run:`, `args:`, `with:`,
`working-directory:`, `paths:` and every other build-relevant key are **not**
excluded — their values still contribute coverage (no over-correction). This
applies to **workflow YAML only**: `cloudbuild.yaml` is intentionally
untouched, because a cloudbuild step `name:` is the BUILDER IMAGE (a genuine
build input), not prose.

**Block / folded-scalar `name:` continuation exclusion (M57 BUG-9b).** The
`name:` exclusion is **block-scalar-aware**, not merely line-oriented. When a
`name:` value (workflow / job / `- name:`) is a YAML block or folded scalar
marker — `name: |`, `name: >`, including the chomping / indentation indicators
`|-` `>-` `|+` `>+` `|2` etc. — the descriptive prose spans multiple physical
lines. The exclusion suppresses **not just the marker line but every
subsequent more-indented continuation line** belonging to that scalar, until
the indentation returns to `<=` the `name:` key indent (a sibling or parent
key ends the scalar; blank lines stay inside it). Rationale: an indented
`name:` continuation line is a separate physical line whose YAML key is not
`name`, so a purely line-oriented exclusion would let its tokens (e.g.
`hooks/` in `          Set up hooks/ directory`) leak in as phantom coverage —
the identical TimeTracking v1.10.12 false-negative class as single-line BUG-9,
reached via the multi-line scalar form of the same `name:` key. The
block-scalar suppression is scoped **strictly to the `name` key**: a `run: |`
/ `run: >` (or any other build-relevant key) block scalar is **not**
suppressed — its command text continuation legitimately contributes coverage
(e.g. `run: |` with `cp -r src/ out/` still covers `src`); only the `name:`
prose block is suppressed (no over-correction). Single-line `name:` scalars
keep the cycle-3 behavior unchanged; the scalar ends and normal token
extraction resumes at the next sibling/subsequent build-relevant line.

After comment-strip, a token registers as a covered top-level reference only
when it is the **FIRST path component** of a path-like token (a leading
segment immediately followed by `/`). Interior components of a longer slash
path do **not** count — e.g. in `node_modules/husky/hooks/` only
`node_modules` is a candidate component, and `husky`/`hooks` are interior and
never register. Additionally, `node_modules/` is **never** treated as
coverage (it is install output, not a shipped source path) — including when it
appears as the FIRST path component of an ordinary command line such as
`run: ls node_modules/.bin`; a committed top-level `node_modules/` directory
not referenced by the Dockerfile is therefore still reported uncovered. This
is intentionally conservative in the direction the contract mandates: false
positives are acceptable; false negatives are not. Counting interior path
components produced the forbidden false negatives — an incidental `name/`
token anywhere in a CI file (e.g. `ls -la node_modules/husky/hooks/`) masked a
genuinely-uncovered new top-level dir sharing that name. Narrowing what counts
as "covered" reduces false negatives while keeping the heuristic library-free.

**Known residual limitation (honest scope statement).** Comment-strip closes
the comment vector and the `name:`-label exclusion closes the descriptive
step/job/workflow-label vector **in every scalar form** — single-line
(plain or quoted) *and* block / folded (`name: |`, `name: >`) including their
multi-line indented continuation lines — but the heuristic does **not**
attempt a full YAML/string parser (zero-dep + simplicity invariant). The
residual is now **strictly scoped to one case**: a directory name that appears
as the first path component **inside a quoted command string in a `run:`/value
(command) position** — e.g. `run: echo "hooks/build is generated"` — may still
register that directory as "covered" even though the string is not a real
build input. This is a deliberately accepted residual: the heuristic is biased
toward a **false positive on a quoted command string** (a directory mentioned
in an `echo`/`run` command string is, in practice, very often *also* a real
build input, and the cost — a real uncovered dir slipping through only when
its name happens to be echoed inside a quoted command string — is strictly
bounded), whereas **comments and descriptive `name:` labels are pure prose and
now never count, regardless of scalar form**. Per the Purpose / SC1 framing
(false positives acceptable, false negatives not), every *non-quoted,
non-command-position prose* vector — a comment, and a step/job/workflow
`name:` label in single-line, quoted, block, or folded scalar form — is now
closed; only the quoted-command-string-in-`run:`/value-position residual is
documented and accepted, not silently ignored.

## Exit Codes (CLI)

| Code | Meaning |
|------|---------|
| 0 | `ok:true` — all new paths covered, OR no CI artifacts exist (`note` set) |
| 4 | `ok:false` — ≥1 new top-level path uncovered (`missing[]` non-empty) |
| 2 | usage error (bad args, not a git repo, bad refs) |

## Defensive Behavior

- No git repo / detached HEAD / identical refs → `UsageError` thrown (not
  returned in envelope); CLI catches and exits 2 with a clear message.
- No CI artifacts at all → `ok:true`, `note:"no CI artifacts detected"`, exit 0
  (nothing to be inconsistent with — this is not a failure).
- Empty diff → `ok:true`, `newPaths:[]`, `note:"empty diff"`, exit 0.

## Success Criterion Binding

SC1: `checkBuildCoverage` on a fixture where a new `hooks/` dir is committed but
absent from the Dockerfile `COPY` directives returns `ok:false`,
`missing:["hooks"]`, CLI exit code 4.

## Changelog

- **1.0.4** — M57 Red Team cycle 4: GitHub Actions block/folded-scalar name:
  continuations no longer count as coverage (BUG-9b).
- **1.0.3** — M57 Red Team cycle 3: GitHub Actions descriptive name: labels no
  longer count as coverage (BUG-9).
- **1.0.2** — M57 Red Team cycle 2: CI-file comments no longer count as
  coverage (BUG-6); node_modules never-coverage now test-enforced (BUG-7).
- **1.0.1** — Defect fix (reconciles code to the existing "false negatives are
  not acceptable" intent; no interface change). The cloudbuild/workflow
  heuristic now counts only the FIRST path component of a path-like token and
  never counts `node_modules/` — closing the BUG-4 false negative where an
  incidental nested token (e.g. `node_modules/husky/hooks/`) masked a new
  uncovered top-level dir. Also adds suite coverage for the `COPY --from=`
  exclusion via a relative-source fixture (BUG-3: the prior absolute-source
  test asserted the right outcome for the wrong reason).
- **1.0.0** — Initial STABLE.
