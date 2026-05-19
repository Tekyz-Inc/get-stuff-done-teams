# Contract: ci-parity

Status: STABLE
Version: 2.0.0
Owner: m57-d2-ci-command-parity
Consumers: commands/gsd-t-verify.md (FAIL-blocking gate), `gsd-t ci-parity` CLI

> v2.0.0 — Re-plan 2026-05-19. The v1.0.x contract documented the correct
> containment *intent*, but the implementation it described had FAILED Red
> Team (the cycle fixes were narrated but the code on disk had no containment
> check at all — a false-completion). v2.0.0 is the contract for the
> in-session-rebuilt code that actually implements the predicate, with the
> containment rule and the mandatory-cache-clear rule both NORMATIVE and
> test-enforced. See memory: feedback_destructive_path_ops_containment.md,
> feedback_detached_fanout_false_completion.md.

## Purpose

Reproduce the project's actual CI build locally instead of assuming local
tsc/test parity. Closes the TimeTracking v1.10.12 stale-cache blind spot
(~8 `noImplicitAny` regressions passed warm-cache local tsc, failed CI).

## API

```
runCiParity({ projectDir, timeoutMs? }) → {
  ok: boolean,
  detectedSource: 'cloudbuild' | 'workflows' | 'dockerfile-run' | 'package-scripts' | 'none',
  commands: [{ cmd, exitCode, ok }],
  cacheCleared: true,            // always true — cache-clear is mandatory-path
  dockerBuilt: boolean,
  dockerSkippedReason?: string,  // 'no-dockerfile' | 'docker-unavailable'
  refusedPaths?: string[],       // config-derived delete targets REFUSED by containment
  note?: string
}
```

## Detection Precedence (LOCKED — user decision, do NOT reorder/extend)

1. `cloudbuild.yaml` → its `steps[].args` command sequence.
2. else `.github/workflows/*.yml` → first job's `steps[].run` commands.
3. else `Dockerfile` → its `RUN` lines.
4. else `package.json` → `scripts.build`, `scripts.typecheck`, `scripts.test`
   (only those present, in that order).
5. none → `detectedSource:'none'`, `ok:true` (unless docker build fails),
   `note` set.

Parsing is minimal (no YAML lib); documented limits in the module docblock.

## Cache Clearing — MANDATORY PATH (normative)

`clearBuildCaches(projectDir)` runs **unconditionally before any detected
command AND before the no-CI / Dockerfile-only return path**. There is no
code path through `runCiParity` that reaches command execution or the
docker step without cache-clear having run first. `cacheCleared:true` is
always in the envelope. (This closes BUG-2: the prior early-return for
`detectedSource:'none'` skipped cache-clear, so removing the cache-clear
call passed every test on a Docker-less host.)

Removes, if present: every `*.tsbuildinfo`, `node_modules/.cache`, and tsc
`outDir`/`tsBuildInfoFile` from `tsconfig*.json`.

### Containment predicate (Destructive Action Guard — NORMATIVE, LOCKED)

Every config-derived delete target is routed through `_isSafeToDelete`:

```
const resolved = path.resolve(targetPath);
const root     = path.resolve(projectRoot);
return resolved !== root && resolved.startsWith(root + path.sep);
```

A path is deleted **only if it is a STRICT DESCENDANT of projectRoot**.
Both halves are load-bearing:

- resolves **outside** projectRoot (`../victim`, absolute) → **REFUSE**
  (BUG-1: `outDir:"../victim"` force-deleted a sibling).
- resolves **equal to** projectRoot (`.`, `./`, `src/..`, `./foo/../`)
  → **REFUSE** (BUG-8: force-deleted the entire repo — deleting the project
  root is never a cache-clear).
- a projectRoot-prefixed **sibling** (`projectRoot + "-evil"`) → **REFUSE**
  (the `+ path.sep` guards the prefix-collision).

A refusal is **silent-safe**: the path is recorded in `refusedPaths[]`,
never deleted, never thrown; legitimate caches are still cleared (no
over-correction — a legitimate `outDir:"dist"` strict-descendant IS
removed). A reviewer finding any config-derived `fs.rmSync`/recursive
delete that does not pass `_isSafeToDelete` first MUST treat it as a
Destructive-Action-Guard violation and a contract violation.

## Docker Trigger (LOCKED — no opt-in flag)

`Dockerfile` present → run real `docker build` (bounded timeout). Build
failing → `ok:false`.
- `Dockerfile` absent → `dockerBuilt:false`, `dockerSkippedReason:'no-dockerfile'`.
- `docker` binary missing → `dockerBuilt:false`,
  `dockerSkippedReason:'docker-unavailable'`, NOT a hard failure.

## Exit Codes (CLI)

| Code | Meaning |
|------|---------|
| 0 | `ok:true` — all detected commands + docker build (if applicable) passed |
| 4 | `ok:false` — ≥1 detected command failed OR docker build failed |
| 2 | usage error |

## Success Criterion Binding

SC2: `runCiParity` on a fixture with a `Dockerfile` + a planted tsc strict
regression a warm-cache local `tsc` would NOT catch runs the real
`docker build`, which fails → `ok:false`, CLI exit 4. The SC2 docker
assertion self-skips with a clear message when no Docker daemon is
available; the cache-clear + detection + **containment** assertions
(BUG-1/BUG-8/prefix-collision/BUG-2) run UNCONDITIONALLY (no Docker).

## Changelog

- **2.0.0** — Re-plan 2026-05-19. Contract for the in-session rebuild that
  actually implements containment (the v1.0.x code had no containment check
  despite the contract describing it — a false-completion). Containment
  predicate + mandatory-cache-clear path made normative and test-enforced;
  `refusedPaths[]` + `cacheCleared` envelope fields added. Prior v1.0.x
  changelog removed (it tracked an abandoned/false-completed design).
