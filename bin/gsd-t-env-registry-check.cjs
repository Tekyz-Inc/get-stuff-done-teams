"use strict";

// bin/gsd-t-env-registry-check.cjs
//
// M102 D3 — the deterministic verify-gate lint for the Environment Registry.
// FAIL-CLOSED. Two failure conditions (spec D3):
//   (a) any Environments row cell is NOT the POSITIVE shape its column is
//       supposed to hold (a value that is not a real hostname / not the enum /
//       not a $VAR / not a curated command token = a probable inline secret);
//   (b) the env-access DOC RULE is present in the project's CLAUDE.md but the
//       `## Environments` table MARKERS are absent from docs/infrastructure.md
//       (rule promises a registry the doc doesn't provide).
//
// A project that has neither the table nor the rule is a NO-OP PASS (it simply
// hasn't adopted M102 yet) — distinguishable from a wired-but-broken FAIL.
//
// Zero external npm runtime deps — fs/path only.
//
// PRIMARY GUARD = POSITIVE PER-COLUMN SHAPE (re-derived here, NOT a call into
// the writer). The gate RE-IMPLEMENTS the positive shapes so a writer bug can
// never silently disable it. It maps each cell to its column and requires the
// cell to BE the shape that column holds:
//   - host        → localhost / IPv4 / dotted-DNS / short lowercase service label
//   - db/name     → short lowercase snake identifier (≤16, no digit→letter)
//   - auth method → enumerated auth-method name
//   - fetch/connect command → every token is $VAR / flag / hostname / curated word
//   - access gotchas → enumerated (vpn|ip-allowlist|ssh-tunnel|bastion|none) + via host
//   - secret vault → enumerated vault name
//   - secret env-var NAME → UPPER_SNAKE
// A cell that is NOT its column's positive shape → FAIL.
//
// BACKSTOP (extra layer, applied to EVERY cell regardless of column): the
// imported known-prefix/JWT/base64/hex `looksLikeSecretValue` + the gate's OWN
// embedded-credential regex. These are NOT the primary guard — the positive
// per-column shape is. A secret that somehow matched a positive shape (it can't
// by construction) would still trip these.

const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  ENV_MARKER_START,
  ENV_MARKER_END,
  ENV_COLUMNS,
  looksLikeSecretValue,
} = require("./gsd-t-env-registry.cjs");

// The gate ALSO carries its own inline embedded-credential detector so it is
// not solely dependent on the imported symbol — a proto://user:pw@ literal in
// ANY cell fails independently of the writer's classification.
const GATE_EMBEDDED_CRED = /[a-z][a-z0-9+.\-]*:\/\/[^\s:/@]+:(?!\$)[^\s:/@]+@/i;

// ─── Gate's OWN re-implemented POSITIVE shapes (independent of the writer) ────
//
// Deliberately re-declared here (not imported) so the gate is a genuinely
// independent implementation — a bug in the writer's shapes cannot disable the
// gate's.

const GATE_DOTTED_HOSTNAME =
  /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/;
// STRICT command hostname (cycle-8 mirror): lowercase labels ≤24, alpha TLD —
// so a dotted high-entropy token cannot launder through the command grammar.
const GATE_STRICT_CMD_HOSTNAME =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,22}[a-z0-9])?\.)+[a-z]{2,}$/;
const GATE_IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/;
const GATE_BARE_HOST_LABEL = /^[a-z][a-z-]{0,15}$/;
const GATE_VAR_REF = /^["']?\$\{?[A-Za-z_][A-Za-z0-9_]*\}?["']?$/;
const GATE_UPPER_SNAKE = /^[A-Z][A-Z0-9_]*$/;
// An ISO-8601 timestamp (the `recorded` column) is structural, not a secret.
const GATE_ISO_TS = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;

const GATE_AUTH_METHODS = new Set([
  "password", "iam", "oauth", "oauth2", "service-account", "ssh-key",
  "api-key", "none", "scram-sha-256", "md5", "trust", "token", "key",
  "cert", "mtls", "kerberos", "ldap",
]);
const GATE_VAULTS = new Set([
  "local", "local (.env)", ".env", "env",
  "vercel", "neon", "gcp-secret-manager", "google secret manager",
  "aws-secrets-manager", "aws secrets manager", "doppler", "1password",
  "hashicorp-vault", "vault", "azure-key-vault", "infisical",
]);
const GATE_GOTCHA_ENUM = new Set(["vpn", "ip-allowlist", "ssh-tunnel", "bastion", "none"]);
// M103 — "this column does not apply to this kind of environment" is a TRUE
// answer, not a hidden value. Accepted ONLY in columns that cannot carry a
// secret anyway (port, secret env-var NAME).
const GATE_NOT_APPLICABLE = new Set(["n/a", "na", "none", "—", "-"]);
// M103 — an auth METHOD the enum has not heard of (`cli-session`,
// `device-code`, `browser-session`). Accepted only in LABEL shape: 1-3 short
// lowercase alphabetic words joined by hyphens, ≤24 chars, NO digits. A
// credential fails this: tokens/keys/passwords carry digits, mixed case, or
// punctuation, and random lowercase-only strings exceed the per-word length.
const GATE_AUTH_LABEL = /^[a-z]{2,12}(?:-[a-z]{2,12}){0,2}$/;
function gateIsAuthLabelShape(s) {
  if (typeof s !== "string") return false;
  const v = s.trim();
  if (v.length > 24) return false;
  return GATE_AUTH_LABEL.test(v);
}
const GATE_CLI_WORDS = new Set([
  "psql", "mysql", "mysqldump", "mongo", "mongosh", "redis-cli", "sqlite3",
  "pg_dump", "pg_restore", "pg_dumpall", "cqlsh", "clickhouse-client",
  "neonctl", "vercel", "gcloud", "aws", "az", "doppler", "supabase",
  "flyctl", "fly", "heroku", "railway", "wrangler", "turso", "op", "infisical",
  "kubectl", "helm", "terraform", "vault",
  "ssh", "scp", "sftp", "curl", "wget", "ldapsearch", "nc", "openssl", "rsync",
  "env", "pull", "push", "list", "get", "set", "secrets", "versions",
  "access", "version", "exec", "run", "connect", "login", "logout",
  "connection-string", "db-url", "database-url", "redis-url",
  // M103 — resource-listing subcommands, the shape of a `source` value
  // ("neonctl projects list"). Ordinary CLI nouns, same class as list/get/show.
  "projects", "project", "branches", "branch", "orgs", "org", "databases",
  "roles", "endpoints", "instances", "buckets", "services", "apps",
  "admin", "default", "latest", "read", "write", "describe", "show",
  "from", "cat", "source", "printenv", "dotenv",
]);
const GATE_DOTFILE_TOKEN = /^\.[a-z][a-z0-9]*(?:\.[a-z][a-z0-9-]*)*$/;

function gateIsDbNameShape(s) {
  if (typeof s !== "string" || s.length === 0 || s.length > 16) return false;
  if (!/^[a-z][a-z0-9_]*$/.test(s)) return false;
  if (/[0-9][a-z]/.test(s)) return false;
  return true;
}
function gateIsHostShape(s) {
  if (s === "localhost") return true;
  if (GATE_IPV4.test(s)) return true;
  if (GATE_DOTTED_HOSTNAME.test(s)) return true;
  if (GATE_BARE_HOST_LABEL.test(s)) return true;
  return false;
}
function gateIsVarRef(tok) {
  const bare = tok.replace(/^["']/, "").replace(/["']$/, "");
  return GATE_VAR_REF.test(tok) || /^\$\{?[A-Za-z_][A-Za-z0-9_]*\}?$/.test(bare);
}
function gateIsBareVarRef(value) {
  return GATE_VAR_REF.test(value) || /^\$\{?[A-Za-z_][A-Za-z0-9_]*\}?$/.test(value);
}

// ─── CONVERGED command grammar — SAFE-LABEL ALLOWLIST (mirror of the writer) ──
//
// Independently re-declared here (a writer bug must not disable the gate). The
// primitive: a bare identifier value is safe ONLY right after an allowlisted
// value-flag (--user/--dbname/--host/--port/--secret). After ANY other flag —
// and for any standalone bare arg — the value must be a $VAR or a provably-safe
// shape (dotted host / IPv4 / localhost / .env dotfile / curated CLI word). This
// closes the whole `--password swordfish` / `-pS3cret` / `--pw=x` leak family:
// those flags are NOT on the safe list, so their value must be a $VAR.

// Each value-flag maps to a TYPED shape (mirror of the writer). A bare value is
// allowed ONLY if it matches that flag's tight shape — NOT a wide identifier
// (cycle-7 leak). A strong/random credential fails and must be a $VAR.
const GATE_VALUE_FLAG_SHAPE = {
  u: "dbname", user: "dbname", username: "dbname",
  d: "dbname", dbname: "dbname", db: "dbname", database: "dbname",
  h: "host", host: "host", hostname: "host",
  port: "port",
  secret: "dbname",
};
function gateFlagBareName(tok) {
  return tok.replace(/^--?/, "").toLowerCase();
}
function gateFlagValueMatchesTypedShape(name, bareVal) {
  const shape = GATE_VALUE_FLAG_SHAPE[name];
  if (shape === "port") return /^\d+$/.test(bareVal);
  if (shape === "host") {
    return bareVal === "localhost" || GATE_IPV4.test(bareVal) ||
      GATE_STRICT_CMD_HOSTNAME.test(bareVal) || GATE_BARE_HOST_LABEL.test(bareVal);
  }
  if (shape === "dbname") return gateIsDbNameShape(bareVal);
  return false;
}
// A bare flag NAME with no attached value: --long, or a single-letter -X. A
// multi-char single-dash token (`-pMyPass`) is a GLUED flag+value, NOT a bare
// flag — it must be classified as flag+value, never as a value-less flag name.
function gateIsBareFlag(bare) {
  if (/^--[A-Za-z][A-Za-z0-9-]*$/.test(bare)) return true;
  if (/^-[A-Za-z]$/.test(bare)) return true;
  return false;
}
// SAFE non-$VAR shapes ANY token may take: dotted-DNS / IPv4 / localhost / .env
// dotfile / curated CLI word. NO bare host-label, NO db-name-shape.
const GATE_SAFE_URL =
  /^[a-z][a-z0-9+.\-]*:\/\/(?:localhost|\d{1,3}(?:\.\d{1,3}){3}|(?:[a-z0-9](?:[a-z0-9-]{0,22}[a-z0-9])?\.)+[a-z]{2,})(?::\d+)?(?:[/?#]\S*)?$/;
function gateIsSafeNonSecretToken(bare) {
  if (bare === "localhost") return true;
  if (GATE_IPV4.test(bare)) return true;
  if (GATE_STRICT_CMD_HOSTNAME.test(bare)) return true; // strict, not loose
  if (GATE_SAFE_URL.test(bare)) return true;
  if (GATE_DOTFILE_TOKEN.test(bare)) return true;
  if (GATE_CLI_WORDS.has(bare.toLowerCase())) return true;
  return false;
}
// A flag's VALUE (attached, glued, or next-token). An allowlisted value-flag may
// carry a bare identifier; every other flag's value must be $VAR or a safe shape.
function gateFlagValueOk(name, value) {
  const bareVal = value.replace(/^["']/, "").replace(/["']$/, "");
  if (gateIsBareVarRef(value)) return true;
  if (gateIsSafeNonSecretToken(bareVal)) return true;
  if (Object.prototype.hasOwnProperty.call(GATE_VALUE_FLAG_SHAPE, name) &&
      gateFlagValueMatchesTypedShape(name, bareVal)) return true;
  return false;
}
// A single command token WITHOUT adjacency (attached flag values + standalone).
function gateCommandTokenOk(tok) {
  const bare = tok.replace(/^["']/, "").replace(/["']$/, "");
  if (bare === "") return true;
  if (gateIsVarRef(tok)) return true;
  // --flag=value
  const eqMatch = bare.match(/^(--?[A-Za-z][A-Za-z0-9-]*)=(.*)$/);
  if (eqMatch) {
    const name = gateFlagBareName(eqMatch[1]);
    const value = eqMatch[2];
    if (value === "") return true;
    return gateFlagValueOk(name, value);
  }
  // glued short flag -pVALUE
  const gluedMatch = bare.match(/^(-[A-Za-z])(.+)$/);
  if (gluedMatch) {
    return gateFlagValueOk(gateFlagBareName(gluedMatch[1]), gluedMatch[2]);
  }
  if (gateIsBareFlag(bare)) return true;
  if (gateIsSafeNonSecretToken(bare)) return true;
  return false;
}
function gateTokenizeCommand(s) {
  const tokens = [];
  const re = /"[^"]*"|'[^']*'|\S+/g;
  let m;
  while ((m = re.exec(s)) !== null) tokens.push(m[0]);
  return tokens;
}
// Adjacency-aware: a bare flag NAME followed by a non-flag value forces that
// value through gateFlagValueOk with the flag's name (so `-U binvoice` passes,
// `--password swordfish` fails).
function gateCommandOk(cell) {
  const tokens = gateTokenizeCommand(cell);
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    const bare = tok.replace(/^["']/, "").replace(/["']$/, "");
    if (gateIsBareFlag(bare) && !gateIsVarRef(tok)) {
      const next = tokens[i + 1];
      if (next !== undefined) {
        const nextBare = next.replace(/^["']/, "").replace(/["']$/, "");
        if (!/^-/.test(nextBare)) {
          if (!gateFlagValueOk(gateFlagBareName(bare), next)) return false;
          i++;
          continue;
        }
      }
      continue;
    }
    if (!gateCommandTokenOk(tok)) return false;
  }
  return true;
}
// M103 — the access-gotchas column is the ONE cell that must carry human
// judgment in plain English ("live seller data — never mutate without an OK").
// That warning is the most valuable thing in the row: it is what stops a
// destructive mistake, and no vendor CLI can ever return it. The M102 enum
// rejected all prose, so the column was written as `none` and the judgment was
// lost.
//
// Prose is allowed here, but NOT as a hole in the guard. A word is accepted
// only if it is PROSE-SHAPED — and a secret is not prose-shaped. The test is
// per-WORD and structural (never a denylist of secret values, which the M102
// cycles proved unwinnable): a word must be ordinary letters, or ordinary
// punctuation, or one of the shapes already proven safe elsewhere in the row.
//
// What a prose word may be:
//   - a letters-only word, with optional internal apostrophe/hyphen, ≤24 chars
//     (`Marla's`, `never`, `read-only`, `VPN`) — no digits, so a random
//     credential cannot pass as a word
//   - a pure number / ordinary punctuation (`6h`, `17`, `—`, `.`, `(main)`)
//   - a shape already whitelisted for other columns (host, $VAR, .env dotfile,
//     curated CLI word, the gotcha enum)
// Everything else — any mixed letters+digits token that is not a plain unit
// like `6h`, anything with credential punctuation — FAILS. That is the shape
// a real secret has, and it still fails here exactly as before.
const GATE_PROSE_WORD = /^[A-Za-z]+(?:['’-][A-Za-z]+)*$/;
// A plain magnitude: 17, 6h, 30d, 5432. Digits with an optional short unit.
const GATE_PROSE_NUMBER = /^\d+[a-z]{0,2}$/i;
// Ordinary sentence punctuation carrying no value.
const GATE_PROSE_PUNCT = /^[.,;:!?()[\]{}"'’“”—–\-/&+%]+$/;

function gateIsProseWord(raw) {
  // Strip surrounding punctuation so `(main),` tests as `main`.
  const w = raw.replace(/^[.,;:!?()[\]{}"'’“”—–]+/, "").replace(/[.,;:!?()[\]{}"'’“”—–]+$/, "");
  if (w === "") return true;
  if (w.length > 24) return false;
  if (GATE_PROSE_WORD.test(w)) return true;
  if (GATE_PROSE_NUMBER.test(w)) return true;
  if (GATE_PROSE_PUNCT.test(w)) return true;
  return false;
}

function gateGotchasOk(cell) {
  const tokens = cell.split(/[,\s]+/).filter(Boolean);
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i].toLowerCase();
    if (GATE_GOTCHA_ENUM.has(t)) continue;
    if (t === "via") {
      const next = tokens[i + 1];
      if (!next || !gateIsHostShape(next)) return false;
      i++;
      continue;
    }
    if (gateIsHostShape(tokens[i])) continue;
    // M103 — plain-English judgment is allowed, word by word.
    if (gateIsSafeNonSecretToken(tokens[i].replace(/^["']/, "").replace(/["']$/, ""))) continue;
    if (gateIsProseWord(tokens[i])) continue;
    return false;
  }
  return true;
}

// ─── M103 — the `source` column: where an unprovable value came from ─────────
//
// A vendor's resource id (`winter-frog-54927244`, `prj_3OQ3gUB1zkm5uraf…`) is
// indistinguishable from a token BY SHAPE — that is a fact about the values,
// not a gap in the grammar, so no amount of pattern-tightening resolves it.
// The M102 answer was to reject them, which forced a worse outcome: rows were
// written with FALSE values to get past the checker (a `staging` environment
// recorded as `prod`, a real command replaced by an unrelated one that
// happened to pass). A checker that makes the truth unwritable buys nothing.
//
// So a value the shape-grammar cannot vouch for is accepted when the row NAMES
// WHERE IT CAME FROM. The source's PRESENCE is the flag — there is no
// per-vendor "source required" list to add to, and therefore none to forget.
//
// What this does and does not defend against: it stops an ACCIDENT (a secret
// pasted into the wrong cell, a connection string carrying its password) —
// which is the whole M102 threat model. It does not stop someone deliberately
// writing a secret and inventing a source for it; nothing mechanical does, and
// that was never in scope.
//
// The source must itself be checkable — a command from the curated CLI words
// or a path to a file in the project. Free prose here would re-open the hole.
// A project-relative file path. It must LOOK like a path — carry a separator or
// a file extension. A bare word (`hunter2`) is NOT a path: allowing one would
// turn this column into the free-text cell the 15-column schema used to catch
// as overflow corruption (a real leak, found by the CYCLE5 overflow tests when
// the `source` column took over the 15th slot).
const GATE_SOURCE_PATH = /^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/;
const GATE_SOURCE_PATH_EVIDENCE = /[/]|^\.[A-Za-z]|\.[A-Za-z0-9]{1,8}$/;

function gateIsSourceShape(s) {
  if (typeof s !== "string") return false;
  const v = s.trim();
  if (v === "" || v === "—") return true;
  if (v.length > 120) return false;
  // A command: every token must clear the same grammar the command columns use.
  if (gateCommandOk(v)) return true;
  // A file path in the project (.vercel/project.json, fly.toml, .env.example).
  // Rejected if absolute, if it climbs out of the project, or if it is a bare
  // word carrying no evidence of being a path at all.
  if (
    GATE_SOURCE_PATH.test(v) &&
    !v.startsWith("/") &&
    !v.includes("..") &&
    GATE_SOURCE_PATH_EVIDENCE.test(v)
  ) {
    return true;
  }
  return false;
}

// Does this row name a source? If so, cells the shape-grammar cannot prove are
// accepted — EXCEPT cells that hit the backstop, which stays absolute (see
// cellLeaks). A source vouches for an unrecognised value; it never vouches for
// something that positively looks like a credential.
function rowNamesASource(cells) {
  const idx = ENV_COLUMNS.indexOf("source");
  if (idx === -1) return false;
  const v = (cells[idx] || "").trim();
  if (v === "" || v === "—") return false;
  return gateIsSourceShape(v);
}

// The BACKSTOP leak test — the known-prefix/JWT/base64/hex detector + the
// embedded-cred regex. Applied to EVERY cell as an extra layer.
function cellHitsBackstop(cell) {
  if (typeof cell !== "string" || !cell) return false;
  if (looksLikeSecretValue(cell)) return true;
  if (GATE_EMBEDDED_CRED.test(cell)) return true;
  return false;
}

// PRIMARY GUARD: is this cell the POSITIVE shape its column is supposed to hold?
// Returns true if the cell is VALID for its column. An empty cell / placeholder
// (`—`) is always valid. `col` is the column NAME.
function cellMatchesColumnShape(col, cell) {
  if (typeof cell !== "string") return true;
  const s = cell.trim();
  if (s === "" || s === "—") return true;
  switch (col) {
    case "id":
      // <scope>-<kind> — lowercase identifier with a hyphen.
      return /^[a-z0-9][a-z0-9-]*$/.test(s);
    case "scope":
      return s === "local" || s === "staging" || s === "prod";
    case "kind":
      return /^[a-z0-9][a-z0-9-]*$/.test(s);
    case "host":
      return gateIsHostShape(s.replace(/:\d+$/, ""));
    case "port":
      // M103: "not applicable" is a TRUE answer for a kind with no port (a
      // web-console / CLI-session environment). Digits or n/a — nothing else.
      return /^\d+$/.test(s) || GATE_NOT_APPLICABLE.has(s.toLowerCase());
    case "db/name":
      // M103: an environment that is not a database (a hosting account, a web
      // console) has no db name. `n/a` is true, not hidden.
      return gateIsDbNameShape(s) || GATE_NOT_APPLICABLE.has(s.toLowerCase());
    case "auth method":
      // M103: the enum can never be complete (every vendor names sign-in its
      // own way — `cli-session`, `device-code`). An unenumerated method is
      // accepted ONLY in LABEL shape: short lowercase hyphenated words. A
      // credential is not that shape (see gateIsAuthLabelShape).
      return GATE_AUTH_METHODS.has(s.toLowerCase()) || gateIsAuthLabelShape(s);
    case "secret vault":
      return GATE_VAULTS.has(s.toLowerCase());
    case "secret env-var NAME":
      // M103: an environment reached by an interactive CLI session carries no
      // env var. `n/a` is the true answer; it is not a secret in any shape.
      return GATE_UPPER_SNAKE.test(s) || GATE_NOT_APPLICABLE.has(s.toLowerCase());
    case "fetch command":
    case "connect command":
      return gateCommandOk(s);
    case "access gotchas":
      return gateGotchasOk(s);
    case "read-only default":
      // M103: a boolean is a boolean whatever its capitalisation. Rejecting
      // `yes` taught humans to retype until the checker relented.
      return /^(yes|no)$/i.test(s);
    case "recorded":
      return GATE_ISO_TS.test(s);
    case "source":
      // M103 — where an otherwise-unprovable value came from. It must itself be
      // checkable: a command built from the curated CLI words, or a path to a
      // file in the project. Free prose here would re-open the hole the column
      // exists to close.
      return gateIsSourceShape(s);
    default:
      // Unknown column — fall back to refusing anything the backstop flags.
      return !cellHitsBackstop(s);
  }
}

// The gate's leak test for a cell in a KNOWN column: FAIL if it is NOT the
// column's positive shape OR (backstop) it hits the known-prefix/embedded-cred
// detector. The positive shape is the PRIMARY guard.
function cellLeaks(col, cell, hasSource) {
  if (typeof cell !== "string" || !cell) return false;
  // BACKSTOP FIRST, and it is absolute: a value that positively looks like a
  // credential (known prefix / JWT / base64 / hex / embedded cred) fails no
  // matter what the row claims about where it came from. A source vouches for
  // the UNRECOGNISED, never for the recognisably-secret.
  if (cellHitsBackstop(cell)) return true;
  if (!cellMatchesColumnShape(col, cell)) {
    // M103 — the shape grammar cannot recognise this value. If the row names
    // where it came from, that is the vouching the shape cannot provide.
    // The `source` column itself is never vouched for by its own presence.
    if (hasSource && col !== "source") return false;
    return true;
  }
  return false;
}

function readSafe(p) {
  try {
    return fs.readFileSync(p, "utf8");
  } catch (_) {
    return null;
  }
}

function splitRow(line) {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  const cells = [];
  let cur = "";
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (ch === "\\" && trimmed[i + 1] === "|") {
      cur += "|";
      i++;
    } else if (ch === "|") {
      cells.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  cells.push(cur.trim());
  return cells;
}

// Per-project local-literal switch (mirror of the writer). When a project opts
// in, a `scope=local` row is EXEMPT from the secret-leak check (the user's
// testing convenience). staging/prod are ALWAYS checked. The OVERFLOW-column
// (corrupt-schema) check is NEVER exempted — a malformed table fails regardless.
function readAllowLocalLiteral(projectDir) {
  const p = path.join(projectDir, ".gsd-t", "env-registry-config.json");
  try {
    const cfg = JSON.parse(fs.readFileSync(p, "utf8"));
    return !!(cfg && cfg.allowLocalLiteral === true);
  } catch (_) {
    return false; // absent / invalid → strict (no silent relax)
  }
}

// ─── M103 — does this project reach anything that is NOT on this machine? ────
//
// The M102 gate treated "no table and no rule" as "hasn't adopted the registry
// yet" and PASSED. That certified the exact emptiness the registry exists to
// prevent: 31 of 33 projects sat in that state, so every session re-asked the
// human for connection details.
//
// A project only NEEDS a map if it reaches a remote environment. So the gate
// now looks for evidence of one. The signals are re-derived HERE rather than
// imported from the writer's detectEnvConfig — the gate must stay independently
// implemented (a writer bug must never disable it), same invariant M102 set for
// the shape grammar.
//
// This is a HALT, not a fallback: a project with a remote environment and no
// map FAILS and says which marker it found. A genuinely local-only project
// PASSES and is NAMED as local-only, so "passed" never silently means
// "unchecked" (no-silent-degradation).
const REMOTE_MARKER_FILES = [
  ["vercel.json", "Vercel"],
  [".vercel", "Vercel"],
  ["cloudbuild.yaml", "Google Cloud"],
  ["cloudbuild.yml", "Google Cloud"],
  [".gcloudignore", "Google Cloud"],
  ["fly.toml", "Fly.io"],
  ["render.yaml", "Render"],
  ["railway.json", "Railway"],
  ["app.yaml", "Google App Engine"],
  ["netlify.toml", "Netlify"],
  ["wrangler.toml", "Cloudflare"],
  ["captain-definition", "CapRover"],
  [".neon", "Neon"],
];
// A dependency whose presence means a hosted service is being talked to.
const REMOTE_DEP_HINTS = [
  ["@neondatabase/serverless", "Neon"],
  ["@vercel/postgres", "Vercel Postgres"],
  ["@supabase/supabase-js", "Supabase"],
  ["@planetscale/database", "PlanetScale"],
  ["@aws-sdk/client-s3", "AWS"],
  ["@google-cloud/storage", "Google Cloud"],
  ["mongodb", "MongoDB"],
];

// M103 — "a recorded command must run as written" was TRIED as a gate check
// here and REMOVED. Two reasons, both found by the existing tests:
//   1. It is not a secret question. Bolting a usefulness check onto the leak
//      gate made it fail rows that are perfectly safe — three pre-existing
//      tests assert bare `neonctl connection-string` is legitimate, correctly.
//   2. The rule was not universally true. `neonctl connection-string` resolves
//      fine in a single-project account; it only opens a picker when the
//      account holds several (as David's does). Generalising one environment's
//      behaviour into a universal requirement is the guess this codebase's
//      No-Fallback/evidence rules exist to stop.
// The requirement survives as guidance in the CLAUDE.md env-access rule, where
// the human recording the row can judge their own account shape.

function detectRemoteEnvironment(projectDir) {
  const found = [];
  for (const [file, label] of REMOTE_MARKER_FILES) {
    try {
      if (fs.existsSync(path.join(projectDir, file))) found.push(`${label} (${file})`);
    } catch (_) { /* unreadable path is not evidence */ }
  }
  try {
    const pkgRaw = fs.readFileSync(path.join(projectDir, "package.json"), "utf8");
    const pkg = JSON.parse(pkgRaw);
    const deps = Object.assign({}, pkg.dependencies, pkg.devDependencies);
    for (const [dep, label] of REMOTE_DEP_HINTS) {
      if (Object.prototype.hasOwnProperty.call(deps, dep)) found.push(`${label} (${dep})`);
    }
  } catch (_) { /* no/unparseable package.json is not evidence */ }
  return found;
}

// Does the table hold at least one row describing a NON-local environment?
// A map listing only `scope=local` rows does not answer "how do I reach prod".
function hasNonLocalRow(infra) {
  const start = infra.indexOf(ENV_MARKER_START);
  const end = infra.indexOf(ENV_MARKER_END);
  if (start === -1 || end === -1) return false;
  const lines = infra.slice(start, end).split("\n");
  for (const line of lines) {
    if (!line.trim().startsWith("|")) continue;
    const cells = splitRow(line);
    if (cells[0] === "id") continue;
    if (cells.every((c) => /^-{1,}$/.test(c) || c === "")) continue;
    const scope = (cells[1] || "").trim().toLowerCase();
    if (scope === "prod" || scope === "staging") return true;
  }
  return false;
}

function check(projectDir) {
  const infraPath = path.join(projectDir, "docs", "infrastructure.md");
  const claudePath = path.join(projectDir, "CLAUDE.md");

  const infra = readSafe(infraPath) || "";
  const claude = readSafe(claudePath) || "";
  const allowLocalLiteral = readAllowLocalLiteral(projectDir);

  const hasMarkers = infra.includes(ENV_MARKER_START) && infra.includes(ENV_MARKER_END);
  // The env-access rule is identified by its stable marker phrase.
  //
  // M103 — the rule ships in the GLOBAL ~/.claude/CLAUDE.md (via
  // templates/CLAUDE-global.md), NOT in a project CLAUDE.md. M102 looked only
  // at the project file, so hasRule was false in EVERY project, which sent
  // every project down the "hasn't adopted it" no-op-PASS branch. Check both:
  // the project file first (a project may restate it), then the global.
  const RULE_PHRASE = /Environment Access — read-first, HALT-and-document/;
  const globalClaude = readSafe(path.join(os.homedir(), ".claude", "CLAUDE.md")) || "";
  const hasRule = RULE_PHRASE.test(claude) || RULE_PHRASE.test(globalClaude);

  const failures = [];

  // (b) M102 asked "the rule promises a map — is there a table?". That made
  // sense while the rule was believed to be per-project. It is not: the rule
  // ships in the GLOBAL CLAUDE.md, so once M103 reads the global file the
  // condition is true in EVERY project and fires on local-only projects that
  // have nothing remote to map (measured: 21 of 28 projects failed on this
  // alone). A gate that fails a project for a correct state gets switched off.
  //
  // Condition (c) below asks the question (b) was reaching for, and asks it
  // against evidence from the project itself rather than a globally-true
  // premise: does this project REACH something remote, and is it mapped?
  // (b) is therefore removed, not merely relaxed — it added no signal (c)
  // does not already carry.

  // (c) M103 — a project that reaches a REMOTE environment must map it. An
  // empty (or local-only) map in a project with a deploy marker is the state
  // that made every session re-ask the human for connection details.
  const remoteMarkers = detectRemoteEnvironment(projectDir);
  const mapsARemoteEnv = hasMarkers && hasNonLocalRow(infra);
  const isLocalOnly = remoteMarkers.length === 0;
  if (!isLocalOnly && !mapsARemoteEnv) {
    failures.push(
      `project reaches a remote environment (${remoteMarkers.join(", ")}) but the ` +
        "`## Environments` table has no prod/staging row — record it with " +
        "`gsd-t env-registry record`, so the connection is not rediscovered every session"
    );
  }

  // (a) secret-shaped value in any row cell.
  if (hasMarkers) {
    const start = infra.indexOf(ENV_MARKER_START);
    const end = infra.indexOf(ENV_MARKER_END);
    const block = infra.slice(start, end);
    const lines = block.split("\n");
    for (const line of lines) {
      if (!line.trim().startsWith("|")) continue;
      const cells = splitRow(line);
      if (cells[0] === "id") continue; // header
      if (cells.every((c) => /^-{1,}$/.test(c) || c === "")) continue; // separator
      // Local-literal exemption: a scope=local row (cells[1]) in an opted-in
      // project skips the SECRET-leak check (but NOT the overflow/corruption
      // check below — a malformed schema always fails).
      const rowScope = (cells[1] || "").trim();
      const exemptSecrets = allowLocalLiteral && rowScope === "local";
      // M103 — does this row say where its values came from? A named source
      // vouches for a value the shape-grammar cannot recognise (a vendor
      // resource id). It never vouches past the backstop.
      const hasSource = rowNamesASource(cells);
      // An OVERFLOW cell (index ≥ the fixed column schema) is itself a
      // corruption signal — a hand-edit/merge/tool that appended a 15th column
      // could hide a plaintext secret in a column the shape-map doesn't cover.
      // The old `col${i}` default branch fell back to the WEAK backstop only
      // (leak #3). A cell beyond the schema is now a HARD FAIL, no exceptions.
      for (let i = 0; i < cells.length; i++) {
        if (i >= ENV_COLUMNS.length) {
          if (cells[i] !== "" && cells[i] !== "—") {
            failures.push(
              `Environments row has an extra cell beyond the fixed ${ENV_COLUMNS.length}-column schema ` +
                `(index ${i}): "${cells[i]}" — the table shape is corrupt; a secret could hide in an ` +
                `unmapped column. Restore the exact ${ENV_COLUMNS.length}-column schema.`
            );
          }
          continue;
        }
        if (exemptSecrets) continue; // opted-in local row — skip secret-leak check
        const col = ENV_COLUMNS[i];
        if (cellLeaks(col, cells[i], hasSource)) {
          failures.push(
            hasSource
              ? `Environments row cell (${col}) contains a secret-shaped literal value: "${cells[i]}" — naming a source does not permit a value that looks like a credential; record the env-var NAME and a $VAR reference`
              : `Environments row cell (${col}) contains a secret-shaped literal value: "${cells[i]}" — record the env-var NAME and a $VAR reference, never a literal secret, OR name where the value came from in the \`source\` column if it is a vendor resource id`
          );
        }
      }
    }
  }

  return {
    ok: failures.length === 0,
    check: "env-registry",
    hasMarkers,
    hasRule,
    // M103 — the reason for a PASS is always NAMED. "local-only" is a real
    // verdict about this project; it never silently means "not checked".
    localOnly: isLocalOnly,
    remoteMarkers,
    failures,
    // Only describe a PASS when it IS one — a note saying "PASS" beside
    // ok:false is exactly the kind of mixed signal this gate exists to remove.
    note:
      isLocalOnly && failures.length === 0
        ? "PASS: local-only — no deploy marker or hosted-service dependency found, so there is no remote environment to map"
        : undefined,
  };
}

function parseArgs(argv) {
  const out = { projectDir: "." };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--project") out.projectDir = argv[++i] || ".";
  }
  return out;
}

module.exports = { check };

if (require.main === module) {
  const { projectDir } = parseArgs(process.argv.slice(2));
  const result = check(projectDir);
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  process.exit(result.ok ? 0 : 1);
}
