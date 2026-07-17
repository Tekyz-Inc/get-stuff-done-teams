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
    return false;
  }
  return true;
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
      return /^\d+$/.test(s);
    case "db/name":
      return gateIsDbNameShape(s);
    case "auth method":
      return GATE_AUTH_METHODS.has(s.toLowerCase());
    case "secret vault":
      return GATE_VAULTS.has(s.toLowerCase());
    case "secret env-var NAME":
      return GATE_UPPER_SNAKE.test(s);
    case "fetch command":
    case "connect command":
      return gateCommandOk(s);
    case "access gotchas":
      return gateGotchasOk(s);
    case "read-only default":
      return s === "YES" || s === "NO";
    case "recorded":
      return GATE_ISO_TS.test(s);
    default:
      // Unknown column — fall back to refusing anything the backstop flags.
      return !cellHitsBackstop(s);
  }
}

// The gate's leak test for a cell in a KNOWN column: FAIL if it is NOT the
// column's positive shape OR (backstop) it hits the known-prefix/embedded-cred
// detector. The positive shape is the PRIMARY guard.
function cellLeaks(col, cell) {
  if (typeof cell !== "string" || !cell) return false;
  if (!cellMatchesColumnShape(col, cell)) return true; // primary: wrong shape
  if (cellHitsBackstop(cell)) return true; // backstop: extra layer
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

function check(projectDir) {
  const infraPath = path.join(projectDir, "docs", "infrastructure.md");
  const claudePath = path.join(projectDir, "CLAUDE.md");

  const infra = readSafe(infraPath) || "";
  const claude = readSafe(claudePath) || "";
  const allowLocalLiteral = readAllowLocalLiteral(projectDir);

  const hasMarkers = infra.includes(ENV_MARKER_START) && infra.includes(ENV_MARKER_END);
  // The env-access rule is identified by its stable marker phrase.
  const hasRule = /Environment Access — read-first, HALT-and-document/.test(claude);

  const failures = [];

  // (b) rule present but table markers absent.
  if (hasRule && !hasMarkers) {
    failures.push(
      "env-access rule is present in CLAUDE.md but the `## Environments` table markers are absent from docs/infrastructure.md"
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
      // An OVERFLOW cell (index ≥ the fixed 14-column schema) is itself a
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
        if (cellLeaks(col, cells[i])) {
          failures.push(
            `Environments row cell (${col}) contains a secret-shaped literal value: "${cells[i]}" — record the env-var NAME and a $VAR reference, never a literal secret`
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
    failures,
    note:
      !hasMarkers && !hasRule
        ? "no-op PASS: project has not adopted the M102 Environments registry (no table, no rule)"
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
