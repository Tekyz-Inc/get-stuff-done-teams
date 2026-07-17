# Environment Registry Contract

**Version:** 1.1.0 DRAFT (converged command grammar — 9 Red Team cycles; STABLE at milestone completion)
**Status:** DRAFT — authored at M102 build; command-grammar section rewritten after cycle-9 GRUDGING-PASS.
**Subject:** the map-only Environments SCHEMA, the two capture TRIGGERS, the HALT-not-fallback rule, the secrets-vs-map split, and the `[RULE]` guard map.
**Milestone:** M102 — Environment Registry (record-at-create + capture-on-first-need).
**Reference (READ-ONLY):** the M100 logging scaffolder's marker-block writer (now extracted to `bin/gsd-t-doc-marker.cjs`) + `detectStack` shape + the installer's guarded settings-writer.

---

## What this contract fixes

The **schema** (the exact map-only columns of the Environments table), the **two triggers** that populate it, and the **invariants** every implementation obeys. It does NOT fix the concrete env vocabulary (scope/kind/vault values VARY per project) — the gate checks the SHAPE and the secret-free invariant structurally, never a hardcoded env value.

## Definition

**Environment registry** = ONE structured, committed, **secret-free** table inside `docs/infrastructure.md` recording every environment's connection MAP. It is the read-first source of truth for reaching any non-local environment. It is **NOT a secret store** — the secret VALUE lives in the vault; the registry records only the map + a pointer to the vault.

## Required schema (map-only columns)

The Environments table lives between `<!-- gsd-t-env-registry:start -->` and `<!-- gsd-t-env-registry:end -->` markers and carries EXACTLY these columns:

| Column | Meaning |
|--------|---------|
| `id` | `<scope>-<kind>` — the upsert key surfaced as a cell. |
| `scope` | `local` \| `staging` \| `prod`. |
| `kind` | `postgres` \| `mysql` \| `redis` \| `http-api` \| `ssh-host` \| … |
| `host` | Hostname / endpoint. |
| `port` | Port. |
| `db/name` | Database or resource name. |
| `auth method` | e.g. password / IAM / key / token. |
| `secret vault` | WHICH vault holds the secret — `local (.env)` \| `Vercel` \| `Neon` \| `Google Secret Manager` \| … |
| `secret env-var NAME` | The env-var NAME only (e.g. `DATABASE_URL_PROD`) — **NEVER the value**. |
| `fetch command` | How to pull the secret from its vault (e.g. `vercel env pull`). **Positive command allowlist** — a token is accepted ONLY if it IS a `$VAR`/`${VAR}` reference, a flag (`-x` / `--flag` / `--flag=<value>` with the value re-checked), a hostname/IP/`localhost`, a `.env`-style dotfile, or a curated CLI/DB subcommand word (or the row's own db-name shape). Any OTHER bare literal is REJECTED (see invariant below). |
| `connect command` | References the env-var by name: `psql "$DATABASE_URL_PROD"`. Same positive command allowlist as `fetch command`. |
| `access gotchas` | **ENUMERATED** — a comma/space list drawn from `vpn` \| `ip-allowlist` \| `ssh-tunnel` \| `bastion` \| `none`, optionally `via <hostname/identifier>` (e.g. `ssh-tunnel via bastion.example.com`). Free prose is FORBIDDEN — there must be nowhere for a secret to hide. |
| `read-only default` | `YES` for `scope=prod` unless a human explicitly recorded write-ok. |
| `recorded` | ISO-8601 timestamp the row was last written. |

**There is deliberately NO secret-value column.** A row is structurally incapable of holding a secret VALUE.

## The two triggers (ONE mechanism)

Both call the SAME `recordEnvironment` upsert.

1. **Trigger 1 — record-at-create (greenfield).** Whenever GSD-T builds/provisions/configures an environment (local test DB, remote server, credentials, setup instructions), it records the map row in the SAME pass. Wired into `gsd-t-init` (infra doc creation) and any execute/quick task that provisions an env.
2. **Trigger 2 — capture-on-first-need (brownfield).** On first non-local access with no entry: HALT the connect → `detectEnvConfig` → ask human to confirm/fill → `recordEnvironment` → `addPermissionEntry` → THEN proceed. Wired into `gsd-t-populate` (back-fill).

## Invariants

- **Secrets-vs-map split (HARD) — POSITIVE ALLOWLIST, NO entropy floor.** Only the map + vault pointer + env-var NAME are stored. THREE Red Team passes proved an entropy/char-class floor CANNOT guard the free-text/command columns: each pass leaked a secret that sat below whatever floor was in place (`Xk9#mPq2vLzR8nQw`, then `hunter2hunter2hunter`, `correcthorsebattery`, …). **The floor is the defect; it is REMOVED as the primary guard.** Every previously-leaking column now uses a TIGHT POSITIVE ALLOWLIST — the same design as the columns that NEVER leaked (`secret vault`/`secret env-var NAME`/`port`/`gotchas`, which are enum / UPPER_SNAKE / digits / enum). A value is accepted ONLY if it IS the shape its column holds; `hunter2hunter2hunter` / `8675309…` / `correcthorsebattery` / `Tr0ub4dor` are rejected because they are NOT a valid hostname / NOT the enum / NOT a `$VAR` — with ZERO entropy check:
  - **`host` — POSITIVE host shape.** `localhost` OR IPv4 OR a dotted DNS hostname OR a short lowercase single-label service name (`^[a-z][a-z-]{0,15}$` — letters+hyphen, NO digits, ≤16, e.g. `db`, `postgres`, `db-primary`). A bare blob with digits (`hunter2hunter2hunter`, `8675309…`) or a long single-label passphrase (`correcthorsebattery`) is NOT a host shape → REJECT.
  - **`db/name` — POSITIVE db-name shape.** A short lowercase-led snake identifier: `^[a-z][a-z0-9_]*$`, ≤16 chars, and NO digit-immediately-followed-by-a-letter (a `2h`-style alternation reads as a blob). Accepts `binvoice_prod`, `analytics`, `neondb_prod`; REJECTS `hunter2hunter2hunter` (`2h` transition), `correcthorsebattery` (>16), `Xk9…` (uppercase).
  - **`auth method` — ENUMERATED.** Allowed: `password` \| `iam` \| `oauth` \| `oauth2` \| `service-account` \| `ssh-key` \| `api-key` \| `none` \| `scram-sha-256` \| `md5` \| `trust` \| `token` \| `key` \| `cert` \| `mtls` \| `kerberos` \| `ldap`. Anything else (incl. `hunter2hunter2hunter`) throws.
  - **`connect command` / `fetch command` — CONVERGED command grammar (SAFE-LABEL ALLOWLIST + TYPED value shapes).** Nine Red Team cycles proved that (a) a DENYLIST of "secret-bearing flag names" is an open category that never converges, and (b) accepting "any bare identifier" as a flag value regressed to an entropy floor. The converged rule, adjacency-aware over the whole command:
    - A token is safe if it is a `$VAR`/`${VAR}` reference (quoted or bare — the ONLY way a secret appears), a bare flag NAME (`--flag` or single-letter `-x`), a network endpoint (`localhost` / IPv4 / a **STRICT** dotted hostname: lowercase labels ≤24 chars, alphabetic TLD), a `scheme://strict-host/…` URL with no embedded `user:pw@`, a `.env`-style dotfile, or a curated CLI/DB subcommand word.
    - A flag's VALUE — whether attached (`--flag=V`), glued (`-xV`), or the next token (`--flag V`) — is safe ONLY if it is a `$VAR`, a safe endpoint shape, OR (for a flag on the **closed** value-flag allowlist) it matches that flag's TYPED shape: `--port`/`-p`-as-port → **digits**; `-h`/`--host` → **host shape**; `-U`/`--user`/`-d`/`--dbname`/`--secret` → the **tight db-name shape** (`^[a-z][a-z0-9_]*$`, ≤16, no digit→letter). A flag NOT on the allowlist (e.g. `--password`, `--pw`, `-a`, `--dsn`, `--token`) forces its value to be a `$VAR`.
    - A STRONG/random/structured credential (mixed case, digit→letter, >16 chars, symbols, ≥24 contiguous base64 / ≥32 hex, or the same once dots/separators are stripped) FAILS every typed shape and trips the backstop → must be `$VAR`. A WEAK dictionary-word username (`-U swordfish`) passes as a valid username (accepted scope — not a *recognizable* secret). Prefer FALSE POSITIVES (move the arg into a `$VAR`) over a leak.
    - The **closed** value-flag allowlist is what converges where the open secret-flag denylist did not: a username and a password are shape-identical, so only the LABEL separates them, and the safe labels (host/user/db/port/secret-resource) ARE completable while secret labels are not.
  - **`access gotchas` — ENUMERATED (no free prose).** Only `vpn` \| `ip-allowlist` \| `ssh-tunnel` \| `bastion` \| `none`, plus an optional `via <positive-host-shape>` qualifier. Anything else throws.
  - The remaining columns keep their positive shape (`scope` ∈ {local,staging,prod}; `kind` `[a-z0-9-]+`; `port` digits; `secret vault` an enumerated vault name; `secret env-var NAME` `[A-Z][A-Z0-9_]*`).
  - **`looksLikeSecretValue` is a SECONDARY backstop only** (known prefixes — `glpat-`/`npm_`/`dop_v1_`/`SG.`/`xapp-`/`github_pat_`/`shpat_`/`shpss_`/…, JWT shape, base64 ≥ 24, hex ≥ 32, any `proto://user:pw@` embedded credential). It is an EXTRA layer, NEVER the primary guard and NEVER an entropy/char-class threshold standing alone between a value and the doc.
  Anything violating its column's POSITIVE shape OR tripping the backstop is REJECTED by `recordEnvironment` (throws).
- **No-Fallback-Ever.** A missing entry → HALT and document (detect → ask → record → proceed). The module emits NO guessed connection string and has NO transcript-grep rediscovery path. The HALT resolves by DOCUMENTING, not by guessing. Zero fallbacks.
- **Upsert by (scope, kind).** A second `recordEnvironment` with the same `(scope, kind)` REPLACES the row — no stale placeholder survives a re-provision (Aiven → Neon).
- **Prod read-only default.** `scope=prod` defaults `read-only=YES`; a prod write op HALTs for human confirmation (Destructive-Action Guard).
- **Shared writer.** The marker-block upsert is the ONE shared `bin/gsd-t-doc-marker.cjs::upsertMarkedDocBlock` — both the M100 scaffolder and this registry call it. No third copy.
- **Broad-glob permissions.** `addPermissionEntry` writes `Bash(<tool>:*)` (tool derived from the connect command's first token), not the exact command string. Invalid-JSON + symlink guarded, idempotent.
- **`.env` gitignore.** `ensureEnvGitignored` auto-adds `.env` when missing and reports (does not HALT — user-locked decision).
- **Local-literal switch (per project).** Default STRICT everywhere (even `scope=local` uses `$VAR`). A project may opt in via `.gsd-t/env-registry-config.json` `{"allowLocalLiteral": true}` to allow a LITERAL secret in `scope=local` rows ONLY. `staging`/`prod` are ALWAYS strict — the switch never relaxes them. A relaxed local write STILL runs the marker-smuggle + structural (scope/kind/port/vault/env-var-NAME) guards; only the free-form secret-capable columns (host/name/auth/commands/gotchas) are relaxed. `recordEnvironment` returns `localLiteralWarning:true` (a committed-file → git-history note); the verify gate exempts opted-in local rows from the leak check but NEVER from the overflow/corruption check. Absent/invalid config → strict (no silent relax).
- **Leak remediation (interactive capture).** The silent guard REJECTS a literal secret. When a HUMAN is present, `detectCommandLeak` + `proposeRemediation` DETECT the leaked secret, SHOW it, and OFFER **rotate-vs-move** into the vault (user chooses each time), then record the `$VAR`-rewritten command. The module ONLY detects + proposes — it never rotates, writes a vault, or prompts (that is the command-file workflow's job, with the user).

## [RULE] guard map

- `[RULE] env-registry-map-only` — no Environments row carries a secret VALUE. Enforced by the **positive per-column allowlist** (host shape / db-name shape / auth-method enum / positive command allowlist / enumerated gotchas / vault enum / UPPER_SNAKE env-var NAME) in `recordEnvironment` (throws) AND an **independent** positive-shape check in the verify gate (`gsd-t-env-registry-check.cjs`). The gate does NOT re-call the writer's `recordEnvironment`/`validateRow`; it RE-IMPLEMENTS the positive shapes (`gateIsHostShape` / `gateIsDbNameShape` / `gateCommandOk` / `gateGotchasOk`, dispatched per column by `cellMatchesColumnShape`) so a writer bug cannot silently disable it, and maps each cell to its column — a cell that is NOT its column's positive shape FAILs. `looksLikeSecretValue` + the gate's own embedded-credential regex remain as a BACKSTOP over every cell (an extra layer, never the primary guard, never an entropy floor standing alone). A cell may reference a secret only by env-var NAME / `$VAR`; a bare literal in ANY field is rejected.
- `[RULE] env-registry-halt-not-fallback` — a missing entry HALTs and documents; no guessed connstring, no transcript-grep (negative test greps the module source).
- `[RULE] env-registry-upsert-by-scope-kind` — re-provision replaces the row (one row per `(scope, kind)`).
- `[RULE] env-registry-prod-readonly` — `scope=prod` → `read-only=YES` default.
- `[RULE] env-registry-shared-writer` — one marker-block writer; scaffolder + registry both require `gsd-t-doc-marker.cjs`.
