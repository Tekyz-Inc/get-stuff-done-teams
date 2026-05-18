# Contract: cli-build-coverage

Status: DRAFT (flips to STABLE at verify)
Version: 0.1.0 (→ 1.0.0 STABLE)
Owner: m57-d1-build-coverage-check
Consumers: commands/gsd-t-verify.md (FAIL-blocking gate), `gsd-t build-coverage` CLI

## Purpose

Detect new top-level paths added in a milestone's commit range that no CI build
artifact references — the TimeTracking v1.10.12 failure class (new `hooks/` dir
committed, absent from Dockerfile `COPY`, shipped broken while verify passed).

## API

```
checkBuildCoverage({ projectDir, baseRef, headRef }) → {
  ok: boolean,
  missing: string[],          // top-level paths not referenced by any CI artifact
  checkedAgainst: string[],   // which CI artifacts were detected & scanned
  newPaths: string[],         // all new top-level paths in baseRef..headRef
  note?: string               // set when no CI artifacts exist (nothing to check)
}
```

- `projectDir` (string, required) — project root.
- `baseRef` / `headRef` (string, optional) — git refs bounding the milestone
  commit range. **Default when omitted**: `HEAD~1..HEAD`. (Plan phase MAY refine
  to a milestone-tag heuristic; the fallback stays `HEAD~1..HEAD`.)

## Detection Rules — a new top-level path is "covered" if referenced by ANY of:

1. `Dockerfile` — a `COPY` or `ADD` directive whose source path includes the
   top-level segment (line-based scan; handles `COPY . .`, `COPY src/ ...`,
   multi-stage `COPY --from=`).
2. `cloudbuild.yaml` — appears in any `steps[].args` or an artifacts/copy path
   (line/regex scan; no YAML lib).
3. `.github/workflows/*.yml` — appears as a path in any workflow file.

`COPY . .` (or `ADD . .`) covers everything → `missing` is empty regardless.

## Exit Codes (CLI)

| Code | Meaning |
|------|---------|
| 0 | `ok:true` — all new paths covered, OR no CI artifacts exist (`note` set) |
| 4 | `ok:false` — ≥1 new top-level path uncovered (`missing[]` non-empty) |
| 2 | usage error (bad args, not a git repo, bad refs) |

## Defensive Behavior

- No git repo / detached HEAD / identical refs → exit 2 with a clear message.
- No CI artifacts at all → `ok:true`, `note:"no CI artifacts detected"`, exit 0
  (nothing to be inconsistent with — this is not a failure).
- Empty diff → `ok:true`, `newPaths:[]`, exit 0.

## Success Criterion Binding

SC1: `checkBuildCoverage` on a fixture where a new `hooks/` dir is committed but
absent from the Dockerfile `COPY` directives returns `ok:false`,
`missing:["hooks"]`, CLI exit code 4.
