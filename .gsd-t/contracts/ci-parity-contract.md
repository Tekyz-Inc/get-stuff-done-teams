# Contract: ci-parity

Status: STABLE
Version: 1.0.2
Owner: m57-d2-ci-command-parity
Consumers: commands/gsd-t-verify.md (FAIL-blocking gate), `gsd-t ci-parity` CLI

> Defect fixes (M57 Red Team cycle 1, 2026-05-18): BUG-1 cache-clear
> containment scoping made explicit (paths escaping `projectDir` are SKIPPED,
> never deleted); BUG-5 detected-but-unparseable CI source now returns
> `ok:false` with a note instead of silent green. Version bumped 1.0.0 → 1.0.1
> — BUG-5 changes an observable outcome (silent-green → explicit-fail), so it
> is a behavior addition, not pure reconciliation; the LOCKED detection
> precedence is unchanged.
>
> Defect fix (M57 Red Team cycle 2, 2026-05-18): BUG-8 — the cycle-1
> containment rule's `equals projectDir` clause itself permitted project-root
> self-deletion when `outDir` resolved to the project root (`"."`, `"./"`,
> `"src/.."`, `"./foo/../"`). Containment hardened to **strict-descendant
> only**: the project root and any ancestor are NEVER eligible for removal.
> Version bumped 1.0.1 → 1.0.2 — the containment rule is corrected (the prior
> rule was unsafe), legitimate strict-descendant clearing (`outDir:"dist"`) is
> unchanged.

## Purpose

Reproduce the project's actual CI build locally instead of assuming local
tsc/test parity. Closes the TimeTracking v1.10.12 stale-cache blind spot
(~8 `noImplicitAny` regressions passed warm-cache local tsc, failed CI).

## API

```
runCiParity({ projectDir, timeoutMs? }) → {
  ok: boolean,
  detectedSource: 'cloudbuild' | 'workflows' | 'dockerfile-run' | 'package-scripts' | 'none',
  commands: [{ cmd: string, exitCode: number, ok: boolean }],
  dockerBuilt: boolean,        // true only if Dockerfile present AND docker available AND build ran
  dockerSkippedReason?: string,// 'no-dockerfile' | 'docker-unavailable'
  note?: string
}
```

## Detection Precedence (LOCKED — user decision, do NOT reorder/extend)

1. `cloudbuild.yaml` present → run its `steps[].args` command sequence.
2. else `.github/workflows/*.yml` present → run `jobs[].steps[].run` commands.
3. else `Dockerfile` present → run its `RUN` lines.
4. else `package.json` → run `scripts.build`, `scripts.typecheck`,
   `scripts.test` (only those that exist, in that order).
5. none of the above → `detectedSource:'none'`, `ok:true`, `note` set.

Parsing is minimal line/regex (no YAML lib). Known limits documented in module
docblock + this contract: only the first job's steps for workflows; `args`
arrays joined with spaces for cloudbuild.

**Detected-but-unparseable → `ok:false` (BUG-5, no silent green).** If a CI
source IS detected (`cloudbuild`/`workflows`/`dockerfile-run`) but the minimal
parser extracts **zero commands**, the result is **NOT** silently green —
nothing real was executed, so CI parity is unproven. `runCiParity` returns
`ok:false` with `note` = `"CI source <X> detected but no commands could be
parsed (parser limitation) and no Dockerfile to reproduce the build — cannot
prove CI parity"`. The detection precedence itself is unchanged (still LOCKED);
only the *consequence* of a detected-but-unparseable source changes from
silent-green to explicit-fail.

Exemptions (these are NOT false-failed):
- A `Dockerfile` is present → the real `docker build` IS the substantive CI
  reproduction. An empty parsed-command list with a Dockerfile present is
  acceptable: docker either ran, or `docker` is merely unavailable on the host
  (contractually a non-failure, see § Docker Trigger).
- `package-scripts` with matching scripts always yields ≥1 command.
- `none` is the legitimately-empty case → `ok:true` (see precedence rule 5).

## Cache Clearing (MANDATORY, before running detected commands)

Remove, if present, under `projectDir`:
- every `*.tsbuildinfo`
- `node_modules/.cache`
- tsc incremental output dirs referenced by `tsconfig*.json` `outDir`/
  `tsBuildInfoFile` (best-effort)

**Containment scoping (BUG-1 + BUG-8, strict-descendant only).** Cache
clearing is *strictly* scoped to **strict descendants** of `projectDir`. A
tsconfig-derived path (`outDir`/`tsBuildInfoFile`) is eligible for removal
**only if** its resolved absolute path starts with `projectDir` +
path-separator **and** is **not equal to** `projectDir` or any ancestor of it.
The **project root itself**, any **ancestor** of `projectDir`, and any
**out-of-tree** path (via `../`, an absolute path, or normalization such as
`"."` / `"./"` / `"src/.."` / `"./foo/../"`) are **NEVER eligible** for
removal — they are **SKIPPED**: best-effort, silent (no throw, no delete).
This is mandated by the global Destructive Action Guard: a recursive
force-delete must never target the project root or above, and must never be
driven by uncontrolled config input — the intent is clearing a warm build
cache (an artifact subdirectory), not the source tree. The prior v1.0.1 rule's
"equals `projectDir`" clause was itself the BUG-8 defect: a config
`outDir:"."` resolved to `projectDir` and caused `fs.rmSync(projectDir,
{recursive,force})` to destroy the entire project (src, package.json, `.git`)
silently and automatically. The `*.tsbuildinfo` and `node_modules/.cache`
removals are inherently contained (built from `projectDir` joins / a
`projectDir`-rooted recursive walk producing strict descendants) and are
guarded by the same strict-descendant check; a tsconfig `outDir`/
`tsBuildInfoFile` resolving to the root or an ancestor is therefore rejected,
while a legitimate strict descendant such as `outDir:"dist"` is still cleared.

Rationale: a warm local cache is exactly what masked the TimeTracking
regression. Skipping this step reintroduces the defect M57 closes.

## Docker Trigger (LOCKED — no opt-in flag)

`Dockerfile` present → run real `docker build` (bounded timeout, output
captured). The build failing → `ok:false`.
- `Dockerfile` absent → `dockerBuilt:false`, `dockerSkippedReason:'no-dockerfile'`.
- `docker` binary missing → `dockerBuilt:false`,
  `dockerSkippedReason:'docker-unavailable'`, NOT a hard failure (projects on
  hosts without a Docker daemon must still pass).

## Exit Codes (CLI)

| Code | Meaning |
|------|---------|
| 0 | `ok:true` — all detected commands + docker build (if applicable) passed |
| 4 | `ok:false` — ≥1 detected command failed OR docker build failed |
| 2 | usage error |

## Success Criterion Binding

SC2: `runCiParity` on a fixture project with a `Dockerfile` and a planted tsc
strict regression that a warm-cache local `tsc` would NOT catch runs the real
`docker build`, which fails → `ok:false`, CLI exit 4.

## Changelog

- 1.0.0 — Initial M57 D2 ci-parity contract.
- 1.0.1 — M57 Red Team cycle 1: BUG-1 cache-clear containment scoping made
  explicit (out-of-tree paths SKIPPED); BUG-5 detected-but-unparseable CI
  source returns `ok:false` with a note instead of silent green.
- 1.0.2 — M57 Red Team cycle 2: containment hardened to strict-descendant-only;
  outDir resolving to project root no longer deletes the project (BUG-8).
