# PseudoCode — Environment Registry

**Purpose:** Record every non-local (and local) environment's connection MAP into `docs/infrastructure.md` — via TWO triggers on ONE mechanism: **(1) record-at-create** (greenfield: GSD-T builds an env → records as it creates) and **(2) capture-on-first-need** (brownfield: an existing project's undocumented env → on first non-local access HALT → capture → write map + permission → THEN proceed). The AI never re-discovers a URL, credential location, or connect command; a missing entry HALTs and documents (never guesses, never greps transcripts). Document-first, then act — so the FIRST need is the LAST rediscovery.

---

## Design anchor: this EXTENDS two things that already exist
- The `docs/infrastructure.md` Living Document (already owns "commands, DB setup, server access, creds").
- The M100 logging-scaffolder's **stop-for-approval + record-to-disk + marker-delimited doc block** shape (`bin/gsd-t-logging-scaffolder.cjs`). We clone that shape, not invent a new one.

---

## CURRENT (today — the gap)

```
# templates/infrastructure.md has free-text "Database > Direct Access > Production: {command}"
#   and a "Credentials > Production" table. No PER-ENVIRONMENT structured row.
# No capture mechanism: nothing writes an env entry when GSD-T builds a test DB / provisions a server.
# No read-first-then-HALT gate for env access — the AI re-greps transcripts or guesses a connstring.
# Result: Binvoice moved Aiven -> Neon; doc kept stale Aiven placeholders; every remote DB command re-prompts.
```

## PROPOSED

### A. Schema — one Environments table in docs/infrastructure.md (COMMITTED, map-only, zero secrets)

```
## Environments   <!-- gsd-t-env-registry:start -->

| id | scope | kind | host | port | db/name | auth method | secret env-var NAME | connect command | access gotchas | read-only default | recorded |
|----|-------|------|------|------|---------|-------------|---------------------|-----------------|----------------|-------------------|----------|
# scope   = local | staging | prod
# kind    = postgres | mysql | redis | http-api | ssh-host | ...
# secret env-var NAME = e.g. DATABASE_URL_PROD  — the NAME only, NEVER the value
# connect command references the env-var by name: `psql "$DATABASE_URL_PROD"`
# access gotchas = VPN required | IP-allowlist | SSH-tunnel via bastion X | none
# read-only default = YES for scope=prod unless human explicitly recorded write-ok
<!-- gsd-t-env-registry:end -->
```

### B. TRIGGER 1: record-at-create hook — greenfield (proactive, not reactive)

```
# FIRES whenever GSD-T CREATES/PROVISIONS/CONFIGURES an environment — same pass, right then:
WHEN gsd-t builds a local test DB
  OR provisions/configures a remote server
  OR sets up credentials
  OR hands the user setup instructions for any env:
    # It HAS url + port + auth method + secret-var-name + connect command RIGHT NOW.
    recordEnvironment({ projectDir, scope, kind, host, port, name, authMethod,
                        secretEnvVarName, connectCommand, gotchas, readOnlyDefault })
      -> upsert row into docs/infrastructure.md Environments table (marker-delimited, idempotent)
      -> if scope==prod and readOnlyDefault unset -> default YES  # Destructive-Action Guard
      -> NEVER write a secret VALUE; only the env-var NAME
    # Reuse the scaffolder's marker-replace idempotent doc-writer verbatim (renamed markers).

# Capture points to wire (evidence-backed seams):
#   - commands/gsd-t-init.md      (infra doc creation)
#   - commands/gsd-t-populate.md  ("For docs/infrastructure.md" section — extract from .env.example/ORM/docker-compose)
#   - any execute/quick task whose work provisions or configures an env
```

### C. Read-first gate — TRIGGER 2: capture-on-first-need (brownfield) (extends No-Re-Research; obeys No-Fallback-Ever)

```
WHEN the AI needs to reach a NON-LOCAL environment:
    entry = lookupEnvironment(scope, kind)   # parse the Environments table (No-Re-Research: doc FIRST)
    IF entry exists:
        use entry.connectCommand              # secret pulled from entry.secretEnvVarName at runtime
        IF scope==prod AND entry.readOnlyDefault==YES AND operation is a write:
            HALT -> ask human to confirm write intent   # Destructive-Action Guard
    IF entry missing:
        # This is Binvoice's live case: prod exists but is UNDOCUMENTED.
        # NOT ask-and-stop-forever. NOT grep-the-transcripts. Document-first, then act:
        HALT the connect attempt
        detected = detectEnvConfig(projectDir)   # reuse detectStack-shape (bin/gsd-t-logging-scaffolder.cjs:51):
                                                 #   .env.example var NAMES, connection-string shapes,
                                                 #   neonctl/vercel/psql presence in deps/PATH
        proposed = buildProposedEntry(scope, kind, detected)   # map only — NEVER a secret value
        ask human to confirm/fill gaps in `proposed`   # the ONE sanctioned pause (scaffolder shape)
        recordEnvironment(proposed)             # writes the map row to the Environments table
        addPermissionEntry(projectDir, proposed.connectCommand)  # .claude/settings.json allow-entry
        THEN proceed with the connect            # first need = last rediscovery
        # ZERO fallback: never a guessed connstring, never a transcript-grep rediscovery,
        #   never proceed-on-missing. The HALT resolves by DOCUMENTING, not by guessing.
```

### D. Re-provision / staleness (Aiven -> Neon lesson)

```
WHEN an env is re-provisioned (host/name/auth changes):
    recordEnvironment(... same scope+kind ...)  # upsert by (scope, kind) key -> REPLACES the stale row
    # Because capture is at setup-time, the move itself triggers the rewrite. No stale placeholder survives.
```

---

## Summary

| Concern | Design | Reused from |
|---------|--------|-------------|
| Where map lives | Environments table in `docs/infrastructure.md`, committed | Living Document (already owns this) |
| Trigger 1 (greenfield) | record-at-CREATE, same pass GSD-T builds the env | user insight (proactive) |
| Trigger 2 (brownfield) | capture-on-first-NEED: HALT → detect+ask → record+permission → proceed | No-Re-Research read-first gate |
| One mechanism | both triggers call the SAME `recordEnvironment` upsert | — |
| Auto-detect (brownfield) | `.env.example` NAMES, connstring shapes, neonctl/vercel presence | `detectStack` (scaffolder:51) |
| Doc writer | marker-delimited idempotent upsert | `writeChoiceToProjectDocs` (M100 scaffolder) |
| Approval-stop | STOP-for-human shape | `scaffoldLogging` PAUSED envelope |
| Permission add | `.claude/settings.json` allow-entry for the connect command | `configureArchitectHook` writer (gsd-t.js:944) |
| Secrets split | env-var NAME only in doc; value in gitignored .env | HARD CONSTRAINT 1 |
| Missing entry | HALT + document, zero fallback (no guess/no transcript-grep) | No-Fallback-Ever Doctrine |
| Prod safety | read-only default YES for prod | Destructive-Action Guard |
| Staleness | upsert by (scope,kind) replaces stale row | record-at-create/re-provision |

---

## E. The secret-guard — how "no secret VALUE in a committed cell" is enforced (9 Red Team cycles → converged)

The registry stores COMMANDS like `psql -h host -U user`. The one hard job: **a real password must never land in a committed command/URL cell.** Plain English of the converged rule:

```
# THE WALL we hit: a username (`-U binvoice`) and a password (`--password swordfish`)
#   are the SAME shape — a plain word. Nothing about the WORD tells them apart.
#   Only the LABEL in front does. So:

# 1. SAFE-LABEL ALLOWLIST (closed, completable — this is what finally converged).
#    A plain word is allowed ONLY right after a known "safe" label:
#        -U/--user, -d/--dbname, -h/--host, --port, --secret(=resource-name)
#    After ANY OTHER label (--password, --pw, -a, --dsn, --token, …) the value
#    MUST be a $VAR. We do NOT keep a list of "secret" labels — that list is
#    endless (every tool invents one). We keep the SHORT list of SAFE labels.

# 2. TYPED VALUE per safe label (so a strong token can't ride in the safe slot).
#        --port  -> digits only
#        -h      -> hostname / IP / localhost
#        -U/-d/--secret -> tight db-name shape (<=16 lowercase, no digit-then-letter)
#    A STRONG/random credential (mixed case, symbols, >16, digit->letter) FAILS
#    every typed shape -> must become $VAR. A WEAK dictionary-word username
#    (`-U swordfish`) passes — a username CAN be a dictionary word; it is not a
#    *recognizable* secret (accepted scope, user-agreed).

# 3. STRICT hostname (so a token can't wear dots as a disguise).
#    A dotted token like `kR8mNp2q.aB9cD1eF` was passing as a "hostname" AND
#    dodging the entropy backstop (dots split it into short pieces). Fix: a
#    command hostname must be lowercase labels <=24 chars with an alphabetic TLD.
#    A real DNS name survives; a high-entropy token does not.

# 4. BACKSTOP (extra layer, never the primary guard): known prefixes (ghp_/AKIA/…),
#    JWT, contiguous base64>=24 / hex>=32, embedded proto://user:pw@, AND the same
#    tests re-run with dots/separators stripped (so a dotted blob is measured whole).

# WHY THIS CONVERGED where 6 prior cycles did not: earlier tries asked "does this
#   value LOOK like a secret?" (entropy/denylist) — an OPEN question with no clean
#   answer. The converged design asks "is this value in a slot PROVEN safe by its
#   label + type?" — a CLOSED question. Everything not provably safe becomes $VAR.
#   Prefer the false positive (an odd-but-legit arg must be $VAR) over any leak.
```

### E.1 Local-literal switch (per project)

```
DEFAULT: strict everywhere — even scope=local uses $VAR.
OPT-IN: .gsd-t/env-registry-config.json {"allowLocalLiteral": true}
    -> a LITERAL secret is allowed in scope=local rows ONLY (testing convenience).
    -> staging/prod ALWAYS strict — the switch never relaxes them.
    -> a relaxed local write returns a one-time "committed file -> git history" warning.
    -> absent/invalid config -> strict (no silent relax).
    -> even relaxed, the marker-smuggle + overflow-column corruption guards STILL run.
```

### E.2 Leak remediation (when a human is present)

```
The silent guard REJECTS a literal secret. But when a human is present (brownfield
capture / a provisioning task), a bare rejection isn't enough — TELL + OFFER a fix:

    proposeRemediation(command)  # detects the leaked secret, names it, proposes:
        rotate -> generate/request a NEW secret (old one is compromised), store in vault
        move   -> move the EXISTING secret into the vault as-is
    ASK the user rotate-vs-move EACH TIME (never assume).
    THEN store to the vault (directly where possible: `vercel env add`, write .env;
         else instruct the user), and record the row with the $VAR-rewritten command.
    # The module ONLY detects + proposes; it never rotates, writes a vault, or prompts.
```
