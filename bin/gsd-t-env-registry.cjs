"use strict";

// bin/gsd-t-env-registry.cjs
//
// M102 — Environment Registry helper. Records every environment's connection
// MAP (never a secret VALUE) into docs/infrastructure.md via the ONE shared
// marker-block writer, and reads it back read-first (No-Re-Research) so a
// missing entry HALTs-and-documents rather than being guessed (No-Fallback-Ever).
//
// Contract: .gsd-t/contracts/env-registry-contract.md
//
// Public surface:
//   recordEnvironment({ projectDir, scope, kind, host, port, name, authMethod,
//                       secretVault, secretEnvVarName, fetchCommand,
//                       connectCommand, gotchas, readOnlyDefault })
//     -> upsert row by (scope, kind) into the Environments table (idempotent).
//   lookupEnvironment(projectDir, scope, kind) -> row object | null.
//   detectEnvConfig(projectDir) -> { vault, fetchCommand, secretEnvVarNames, ... }
//   addPermissionEntry(projectDir, connectCommand) -> { added, tool, entry }
//   ensureEnvGitignored(projectDir) -> { added }
//
// Zero external npm runtime deps — fs/path only. Reuses the M100 detectStack
// SHAPE and the ONE shared marker-block doc-writer (gsd-t-doc-marker.cjs).

const fs = require("fs");
const path = require("path");
const { upsertMarkedDocBlock, extractMarkedDocBlock } = require("./gsd-t-doc-marker.cjs");

// ─── Markers + schema ────────────────────────────────────────────────────────

const ENV_MARKER_START = "<!-- gsd-t-env-registry:start -->";
const ENV_MARKER_END = "<!-- gsd-t-env-registry:end -->";

// Map-only columns — NO secret-value column exists (a row is structurally
// incapable of holding a secret VALUE). `secret vault` + `secret env-var NAME`
// + `fetch command` record WHERE the secret lives and HOW to fetch it, never
// the value itself.
const ENV_COLUMNS = [
  "id",
  "scope",
  "kind",
  "host",
  "port",
  "db/name",
  "auth method",
  "secret vault",
  "secret env-var NAME",
  "fetch command",
  "connect command",
  "access gotchas",
  "read-only default",
  "recorded",
];

// ─── Secret-value BACKSTOP detector (known-prefix / JWT / embedded-cred) ─────
//
// THIS IS A BACKSTOP ONLY — never the primary guard. The PRIMARY guard for
// every free-ish column is a TIGHT POSITIVE ALLOWLIST (see the per-column
// validators below): a value is accepted ONLY if it matches the shape its
// column is supposed to hold (a real hostname / an enum member / a $VAR / a
// curated subcommand word). A value like `hunter2hunter2hunter` or
// `correcthorsebattery` is rejected because it is NOT a valid hostname / NOT
// the enum / NOT a $VAR — with ZERO entropy or character-class threshold.
//
// THREE Red Team passes proved the inverse ("reject if it looks like a secret",
// a denylist with an entropy floor) leaks: every floor eventually admits a
// secret that sits below it. The floor is the defect; it is GONE as a primary
// guard. This backstop remains only to cheaply catch the well-known credential
// SHAPES (GitHub / Stripe / AWS / Slack / Google prefixes, JWTs, embedded
// proto://user:pw@ creds) — an EXTRA layer, never the sole thing between a
// value and the doc.

// Known secret prefixes. A token STARTING with one of these is a live secret.
// Belt-and-suspenders only — the structural validators (command allowlist +
// enumerated gotchas + gate high-entropy scan) are the real guard for an OPEN
// category. This list catches the well-known SHAPES cheaply.
const KNOWN_SECRET_PREFIXES = [
  "ghp_", "gho_", "ghs_", "ghu_", "ghr_", // GitHub PAT / OAuth / server / user / refresh
  "github_pat_", // GitHub fine-grained PAT
  "sk_live", "sk_test", "pk_live", "rk_live", // Stripe
  "AKIA", "ASIA", // AWS access-key ids
  "xoxb-", "xoxp-", "xoxa-", "xoxr-", "xoxs-", "xapp-", // Slack (incl. app-level)
  "AIza", // Google API key
  "glpat-", // GitLab personal access token
  "gitlab", // GitLab-prefixed tokens (belt-and-suspenders)
  "npm_", // npm automation token
  "dop_v1_", // DigitalOcean PAT
  "SG.", // SendGrid API key
  "shpat_", "shpss_", // Shopify access / shared-secret
];

// proto://user:PASSWORD@host for ANY scheme (not a hardcoded scheme allowlist).
// The password segment is a literal only when it is NOT a $-reference.
const EMBEDDED_CRED = /[a-z][a-z0-9+.\-]*:\/\/[^\s:/@]+:(?!\$)[^\s:/@]+@/i;

// JWT: three base64url segments joined by dots. A real JWT's header segment is
// the base64url of a JSON object beginning `{"` → it ALWAYS starts with `eyJ`.
// Anchoring on that avoids a false positive on a 3-part dotted hostname
// (`ep-neon.neon.tech`), while still catching every genuine token.
const JWT_SHAPE = /^eyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{4,}$/;

// A contiguous base64/hex run inside a larger string (e.g. `Bearer <token>`).
const BASE64_RUN = /[A-Za-z0-9+/]{24,}={0,2}/;
const HEX_RUN = /\b[0-9a-fA-F]{32,}\b/;

// True when `s` contains (or is) a live secret value. Used BOTH as the reject
// test inside the per-column allowlist checks AND as the verify gate's
// independent detector.
function looksLikeSecretValue(s) {
  if (typeof s !== "string" || !s) return false;
  // Known prefixes — anywhere a whitespace/quote-delimited token begins.
  for (const tok of s.split(/[\s"'`=:,()<>]+/)) {
    if (!tok) continue;
    for (const p of KNOWN_SECRET_PREFIXES) {
      if (tok.startsWith(p) && tok.length > p.length) return true;
    }
    if (JWT_SHAPE.test(tok)) return true;
  }
  if (EMBEDDED_CRED.test(s)) return true;
  // High-entropy runs — but ignore a $-reference and skip pure hostnames
  // (dotted, no long unbroken run) which the base64 run would otherwise catch.
  if (HEX_RUN.test(s)) return true;
  const b64 = s.match(BASE64_RUN);
  if (b64) {
    const run = b64[0];
    // A hostname segment is short and dotted; a real blob is one long run.
    if (run.length >= 24) return true;
  }
  // Cycle-8 fix: a high-entropy token can DODGE the contiguous-run tests by
  // inserting dots (`kR8mNp2qX7wZ4vT6.aB9cD1eF3gH5jK0lM2n` splits into sub-24
  // labels). Re-test with separators (dots/hyphens/underscores/colons/slashes)
  // stripped, so a dotted blob is measured as ONE run. A REAL dotted hostname
  // survives this because its labels are lowercase words that don't form a long
  // base64/hex run once joined (`api.example.com` → `apiexamplecom`, no ≥24
  // run) AND it contains no MIXED-CASE-with-digits density. To avoid flagging a
  // long lowercase-only real domain, only trip when the joined run also carries
  // BOTH upper- and lower-case OR is a ≥32 hex — i.e. token-like, not word-like.
  const joined = s.replace(/[.\-_:/]+/g, "");
  if (/[0-9a-fA-F]{32,}/.test(joined)) return true;
  const jb64 = joined.match(/[A-Za-z0-9+/]{24,}={0,2}/);
  if (jb64) {
    const run = jb64[0];
    const hasUpper = /[A-Z]/.test(run);
    const hasLower = /[a-z]/.test(run);
    const hasDigit = /[0-9]/.test(run);
    // token-like = mixed case, or (case + digits). A long all-lowercase word
    // (a real domain joined) is NOT flagged.
    if ((hasUpper && hasLower) || (hasDigit && (hasUpper || hasLower && run.length >= 32))) {
      return true;
    }
  }
  return false;
}

// Back-compat alias — the OLD name is kept exported so nothing that imports it
// breaks, but it now points at the strict entropy/prefix detector.
function looksLikeInlineSecret(value) {
  return looksLikeSecretValue(value);
}

// ─── POSITIVE-ALLOWLIST shape primitives (shared: writer + verify gate) ──────
//
// These are the PRIMARY guard for every free-ish column. NOT an entropy floor —
// a set of TIGHT POSITIVE shapes. A value is accepted ONLY if it IS a real
// hostname / IP / $VAR / enum member / curated subcommand word. Everything else
// is REJECTED, so `hunter2hunter2hunter` / `8675309…` / `correcthorsebattery` /
// `Tr0ub4dor` fail because they are none of those shapes — with ZERO entropy or
// character-class threshold anywhere.

// A dotted hostname/domain: labels of [A-Za-z0-9-] joined by dots, at least one
// dot, TLD-ish last label. Recognizes `ep-cool.us-east-2.aws.neon.tech`,
// `bastion.example.com`, `api.example.com`.
const DOTTED_HOSTNAME =
  /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/;

// STRICT command-context hostname (cycle-8 fix). A dotted host appearing INSIDE
// a connect/fetch command must look like a REAL DNS name, because the loose
// DOTTED_HOSTNAME let a high-entropy token launder through by inserting a dot
// (`kR8mNp2qX7wZ4vT6.aB9cD1eF3gH5jK0lM2n` split into sub-24 labels dodged the
// backstop AND passed as a "hostname"). A real DNS name is:
//   • lowercase-led labels of [a-z0-9-] (DNS is case-insensitive; a mixed-case
//     high-entropy label is not a real host — force lowercase here),
//   • each label ≤ 24 chars (a 16+ char RANDOM label is a laundered token, not a
//     real DNS label — real labels are short words / regions / ids),
//   • a purely ALPHABETIC TLD of ≥2 chars (`.tech`, `.com`, `.io`) — a token's
//     trailing label is not an alpha TLD.
// This is a SHAPE tightening (real-hostname structure), NOT an entropy floor.
const STRICT_CMD_HOSTNAME =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,22}[a-z0-9])?\.)+[a-z]{2,}$/;

// IPv4 dotted-quad (loose — 1-3 digits per octet; not validating 0-255 range,
// only the SHAPE, which is enough to distinguish a real IP from a digit blob).
const IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/;

// A bare single-label host: letters + hyphen ONLY (NO digits), ≤ 16 chars,
// lowercase-led. Accepts docker/service names `db`, `postgres`, `db-primary`,
// and the single-char test host `h`. REJECTS `hunter2hunter2hunter` (digits),
// `8675309…` (digits), and a long single-label passphrase like
// `correcthorsebattery` (19 > 16) — a bare blob is never a valid host here.
// Real docker/service hostnames are short; a genuinely long endpoint is dotted
// DNS or an IP, both of which have their own positive shapes.
const BARE_HOST_LABEL = /^[a-z][a-z-]{0,15}$/;

// A $VAR / ${VAR} reference, optionally single/double-quoted — the ONLY
// sanctioned way a secret ever appears in a command.
const VAR_REF = /^["']?\$\{?[A-Za-z_][A-Za-z0-9_]*\}?["']?$/;

// A pure UPPER_SNAKE env-var NAME (e.g. DATABASE_URL_PROD, SECRET) — a NAME,
// never a value.
const UPPER_SNAKE = /^[A-Z][A-Z0-9_]*$/;

// A short lowercase-led SNAKE identifier used for db / resource names. Positive
// shape (NOT an entropy floor): lowercase-led, [a-z0-9_], ≤ 16 chars, and NO
// digit-immediately-followed-by-a-letter (a `2h`-style alternation reads as a
// blob, never a real db name). Accepts `binvoice_prod` (13), `analytics`,
// `neondb_prod`, `appdb`; REJECTS `hunter2hunter2hunter` (`2h` transition),
// `correcthorsebattery` (19 > 16), `Xk9…` (uppercase).
const DB_NAME_MAX = 16;
function isDbNameShape(s) {
  if (typeof s !== "string" || s.length === 0 || s.length > DB_NAME_MAX) return false;
  if (!/^[a-z][a-z0-9_]*$/.test(s)) return false;
  if (/[0-9][a-z]/.test(s)) return false; // digit→letter interior = blob-like
  return true;
}

// A dotted hostname OR IPv4 OR `localhost` — any real network endpoint shape.
function isHostShape(s) {
  if (s === "localhost") return true;
  if (IPV4.test(s)) return true;
  if (DOTTED_HOSTNAME.test(s)) return true;
  if (BARE_HOST_LABEL.test(s)) return true;
  return false;
}

// ─── Per-column ALLOWLIST validators ─────────────────────────────────────────
//
// Each column may contain ONLY its expected shape. Anything else THROWS — the
// row is REJECTED and never written. This is the inversion the Red Team
// prescribed: a bare secret in ANY field fails its column's shape check.

const SCOPES = new Set(["local", "staging", "prod"]);
const VAULTS = new Set([
  "local", "local (.env)", ".env", "env",
  "vercel", "neon", "gcp-secret-manager", "google secret manager",
  "aws-secrets-manager", "aws secrets manager", "doppler", "1password",
  "hashicorp-vault", "vault", "azure-key-vault", "infisical",
]);

// `auth method` is an ENUM (positive allowlist), exactly like `secret vault`
// and `access gotchas`. A value NOT in this set is rejected — so
// `hunter2hunter2hunter` fails because it is not an auth-method name, with NO
// entropy check. Extend as real auth methods appear (this is the curated set,
// not a floor).
const AUTH_METHODS = new Set([
  "password", "iam", "oauth", "oauth2", "service-account", "ssh-key",
  "api-key", "none", "scram-sha-256", "md5", "trust", "token", "key",
  "cert", "mtls", "kerberos", "ldap",
]);

// Curated CLI / DB subcommand words a command may carry as a BARE literal arg.
// A positive allowlist — a bare arg is accepted only if it is one of these OR
// the row's own db-name shape OR a hostname / $VAR / flag. Anything else must
// become a $VAR (see classifyCommandToken). Extend as real tools appear.
const CLI_WORDS = new Set([
  // DB / shell clients
  "psql", "mysql", "mysqldump", "mongo", "mongosh", "redis-cli", "sqlite3",
  "pg_dump", "pg_restore", "pg_dumpall", "cqlsh", "clickhouse-client",
  // vault / platform CLIs
  "neonctl", "vercel", "gcloud", "aws", "az", "doppler", "supabase",
  "flyctl", "fly", "heroku", "railway", "wrangler", "turso", "op", "infisical",
  "kubectl", "helm", "terraform", "vault",
  // network clients
  "ssh", "scp", "sftp", "curl", "wget", "ldapsearch", "nc", "openssl", "rsync",
  // common subcommands / operands
  "env", "pull", "push", "list", "get", "set", "secrets", "versions",
  "access", "version", "exec", "run", "connect", "login", "logout",
  "connection-string", "db-url", "database-url", "redis-url",
  "admin", "default", "latest", "read", "write", "describe", "show",
  // descriptive-fetch operands (the detectEnvConfig fallback: "read $VAR from .env")
  "from", "cat", "source", "printenv", "dotenv",
]);

// A dotfile operand a command may reference (e.g. `.env`, `.env.local`,
// `.gcloudignore`). REQUIRES a leading dot — that is what makes it a dotfile
// and NOT a bare blob (`hunter2…` has no leading dot, so it never matches).
// Short lowercase labels only; a leading-dot filename is a filesystem path,
// never a secret VALUE.
const DOTFILE_TOKEN = /^\.[a-z][a-z0-9]*(?:\.[a-z][a-z0-9-]*)*$/;

// The doc-block markers a smuggled cell could use to corrupt upsert indexOf.
const RESERVED_MARKER_SUBSTRINGS = [
  ENV_MARKER_START, ENV_MARKER_END,
  "gsd-t-env-registry:start", "gsd-t-env-registry:end",
  "gsd-t-logging-scaffold:start", "gsd-t-logging-scaffold:end",
];

function rejectMarkerSmuggle(field, value) {
  if (typeof value !== "string" || !value) return;
  for (const m of RESERVED_MARKER_SUBSTRINGS) {
    if (value.includes(m)) {
      throw new Error(
        `recordEnvironment: field "${field}" contains a reserved doc-marker substring ` +
          `("${m}") — refusing to write a value that could corrupt the marked doc block.`
      );
    }
  }
}

function rejectSecret(field, value) {
  if (looksLikeSecretValue(value)) {
    throw new Error(
      `recordEnvironment: refusing to write an inline literal secret in field "${field}". ` +
        `Record the secret env-var NAME and reference it as $VAR (e.g. psql "$DATABASE_URL_PROD"), ` +
        `never a literal password/token/connection-string.`
    );
  }
}

// Optional-string helper: undefined/null/"" pass through as empty (—).
function optStr(v) {
  return v === undefined || v === null ? "" : String(v);
}

function validateScope(v) {
  if (!SCOPES.has(v)) {
    throw new Error(`recordEnvironment: scope must be one of local|staging|prod, got "${v}"`);
  }
}

function validateKind(v) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(v)) {
    throw new Error(`recordEnvironment: kind must match [a-z0-9-]+ (e.g. postgres, http-api), got "${v}"`);
  }
  // Symmetry with the gate: a real kind is a short word (`postgres`, `http-api`),
  // never a long hex/token blob. The backstop rejects a hex≥32 / base64≥24 kind
  // so the writer never accepts what the gate would fail (closes the cycle-9
  // writer/gate divergence — harmless, but no reason to keep it).
  rejectSecret("kind", v);
}

function validateHost(field, v) {
  const s = optStr(v);
  if (s === "") return;
  // POSITIVE shape: `localhost` | IPv4 | dotted-DNS | a bare service label
  // (letters+hyphen, ≤24, no digits). Strip an optional trailing `:port`.
  const hostPart = s.replace(/:\d+$/, "");
  if (!isHostShape(hostPart)) {
    throw new Error(
      `recordEnvironment: ${field} "${s}" is not a valid host shape. ` +
        `A host must be "localhost", an IPv4 address, a dotted DNS hostname ` +
        `(e.g. ep-cool.us-east-2.aws.neon.tech), or a short lowercase service ` +
        `name (letters+hyphen, no digits — e.g. db, postgres, db-primary). ` +
        `A bare token like "${hostPart}" is rejected — if it is a secret, move ` +
        `it to an env var and reference it as $VAR.`
    );
  }
  // Backstop (extra layer, never the primary guard).
  rejectSecret(field, s);
}

function validatePort(v) {
  const s = optStr(v);
  if (s === "") return;
  if (!/^\d+$/.test(s)) {
    throw new Error(`recordEnvironment: port must be digits only, got "${s}"`);
  }
}

function validateName(v) {
  const s = optStr(v);
  if (s === "") return;
  // POSITIVE shape: a short lowercase-led snake db-name (≤16, no digit→letter
  // interior). Accepts `binvoice_prod`, `analytics`, `neondb_prod`, `appdb`;
  // REJECTS `hunter2hunter2hunter` (`2h` transition), `correcthorsebattery`
  // (too long), `Xk9…` (uppercase) — NO entropy check.
  if (!isDbNameShape(s)) {
    throw new Error(
      `recordEnvironment: db/name "${s}" is not a valid db-name shape. ` +
        `A db name must be a short lowercase identifier (≤${DB_NAME_MAX} chars, ` +
        `lowercase-led [a-z][a-z0-9_]*, no digit-then-letter run — e.g. ` +
        `binvoice_prod, analytics). A blob like "${s}" is rejected; if it is a ` +
        `secret, move it to an env var and reference it as $VAR.`
    );
  }
  // Backstop (extra layer).
  rejectSecret("db/name", s);
}

function validateAuthMethod(v) {
  const s = optStr(v);
  if (s === "") return;
  // POSITIVE ENUM (like `secret vault` / `access gotchas`). A value NOT in the
  // curated set is rejected — `hunter2hunter2hunter` fails because it is not an
  // auth-method name, with NO entropy check.
  if (!AUTH_METHODS.has(s.toLowerCase())) {
    throw new Error(
      `recordEnvironment: auth method "${s}" is not an enumerated auth method. ` +
        `Allowed: ${[...AUTH_METHODS].join(" | ")}. A secret is never an ` +
        `auth-method value — record the method name only.`
    );
  }
  // Backstop (extra layer).
  rejectSecret("auth method", s);
}

function validateVault(v) {
  const s = optStr(v);
  if (s === "") return;
  rejectSecret("secret vault", s);
  if (!VAULTS.has(s.toLowerCase())) {
    throw new Error(
      `recordEnvironment: secret vault must be an enumerated vault name ` +
        `(local|vercel|neon|gcp-secret-manager|aws-secrets-manager|env|…), got "${s}"`
    );
  }
}

function validateEnvVarName(v) {
  const s = optStr(v);
  if (s === "") return;
  // an env-var NAME only: UPPER_SNAKE. A real value has lowercase/entropy.
  // Backstop first: `AKIAIOSFODNN7EXAMPLE` is valid UPPER_SNAKE but is an AWS
  // key id — the known-prefix detector rejects it.
  rejectSecret("secret env-var NAME", s);
  if (!/^[A-Z][A-Z0-9_]*$/.test(s)) {
    throw new Error(
      `recordEnvironment: secret env-var NAME must be [A-Z][A-Z0-9_]* (a NAME, not a value), got "${s}"`
    );
  }
}

// ─── Command POSITIVE allowlist ──────────────────────────────────────────────
//
// A command token is accepted ONLY if it IS one of a small set of SAFE POSITIVE
// shapes; ANYTHING else THROWS. This is the PRIMARY guard for the connect/fetch
// columns. NO entropy threshold — THREE Red Team passes proved a floor always
// admits a secret below it. The positive rule instead admits ONLY:
//
//   1. a $VAR / ${VAR} reference (optionally quoted) — the ONLY sanctioned way
//      a secret ever appears in a command;
//   2. a flag: `-x` | `--flag` (bare) | `--flag=<value>` (value re-checked
//      by the SAME positive rule — a bare literal flag value must itself be a
//      $VAR / hostname / curated word);
//   3. a dotted hostname / IPv4 / `localhost` (a network endpoint);
//   4. a bare literal arg ONLY if it is a curated CLI/DB subcommand word OR the
//      row's own db-name shape (short lowercase snake, ≤16, no digit→letter).
//
// A bare literal that is NONE of these — `hunter2hunter2hunter`,
// `correcthorsebattery`, `Xk9#mPq2vLzR8nQw`, a UUID, a platform token — is
// REJECTED with "put this value in an env var and reference it as $VAR". We
// ACCEPT the false positive that an unusual-but-legit bare arg must become a
// $VAR — that is the correct trade for a secrets-adjacent file.

// True if a BARE literal command arg is on the positive allowlist: a curated
// subcommand word OR a db-name shape (row identifier). NO entropy check.
function isSafeBareArg(bare) {
  if (CLI_WORDS.has(bare.toLowerCase())) return true;
  if (isDbNameShape(bare)) return true;
  return false;
}

// ─── Command grammar — CONVERGED (cycle-6 pivot: SAFE-LABEL ALLOWLIST) ────────
//
// SIX Red Team cycles leaked a credential through the command columns. The wrong
// primitive each time: a hardcoded set of SECRET-bearing flag names (`--password`,
// `--pw`, `-a`, …) — an OPEN category that can never be listed completely. Cycle
// 6 walked straight past it with `psql --password swordfish` (a flag name not
// yet listed, value in the next token matching the host-label shape).
//
// THE FIX — invert the list. A username (`-U binvoice`) and a password
// (`--password swordfish`) are the SAME shape; only the LABEL in front tells them
// apart. So instead of an endless denylist of secret labels, use a SHORT CLOSED
// ALLOWLIST of the labels whose value may be a bare identifier:
//   VALUE_FLAGS = { -U/--user/--username, -d/--dbname/--db, -h/--host/--hostname,
//                   -p-as-PORT/--port, --secret (gcloud resource NAME) }
// A bare identifier value is allowed ONLY right after one of these. After ANY
// OTHER flag — and for any standalone bare arg — the value MUST be a $VAR or a
// provably-safe shape (dotted-DNS / IPv4 / localhost / .env dotfile / curated CLI
// word). `--password`, `--pw`, `-a`, `--dsn`, `--token` are leak-proof because
// they are NOT on the safe list, so their value can only be a $VAR.
//
// The safe list is CLOSED and completable (there are only so many ways to name a
// host / user / db / port). The secret list was open and never was. That is why
// this converges where six denylist cycles did not.
//
// Local-scope escape hatch: a `scope=local` row MAY be exempted from the command
// secret-guard per project (allowLocalLiteral). Default OFF (strict everywhere).
// staging/prod are ALWAYS strict.

// Split a command into whitespace-delimited tokens, but keep a quoted segment
// (single or double quotes) as ONE token so `"$DATABASE_URL"` stays intact.
function tokenizeCommand(s) {
  const tokens = [];
  const re = /"[^"]*"|'[^']*'|\S+/g;
  let m;
  while ((m = re.exec(s)) !== null) tokens.push(m[0]);
  return tokens;
}

// A $VAR / ${VAR} reference, quoted or bare.
function isVarToken(tok, bare) {
  return VAR_REF.test(tok) || /^\$\{?[A-Za-z_][A-Za-z0-9_]*\}?$/.test(bare);
}

// Is this token a bare flag NAME with NO attached value? A LONG flag `--word`,
// or a SHORT flag that is EXACTLY one letter (`-U`, `-d`). A multi-char single-
// dash token (`-pMyPass`, `-Wswordfish`) is a GLUED flag+value, NOT a bare flag
// name — it must NOT be treated as a value-less flag (that was leak: the glued
// password was read as a flag name and never checked). `--` long flags are bare;
// `-XY…` short-with-payload is glued.
function isBareFlag(bare) {
  if (/^--[A-Za-z][A-Za-z0-9-]*$/.test(bare)) return true; // --long
  if (/^-[A-Za-z]$/.test(bare)) return true;               // -X (single letter only)
  return false;
}

// CLOSED allowlist of flag names whose VALUE may be a bare literal — but each
// maps to a TYPED SHAPE, never a wide "any identifier" (cycle 7 leaked because
// the value slot accepted any ≤23-char blob, so a strong token after `-U`/`-h`/
// `--port` passed, caught only by the entropy backstop — the un-winnable
// primitive). Each flag's value must be the SAME tight shape its COLUMN uses:
//   port  → digits only            (`--port swordfish` fails)
//   host  → dotted-DNS / IPv4 / localhost / short service label (`-h swordfish`
//                                    passes only as a service label; a strong
//                                    token fails)
//   user/db → tight db-name shape  (≤16 lowercase snake, no digit→letter — a
//                                    strong/random token `aB3xK9…` / `S3cretP4ss`
//                                    FAILS → must be $VAR; a weak dictionary
//                                    username like `binvoice` passes)
//   secret → resource-NAME shape (db-name-like) OR $VAR (a real credential value
//                                    fails the shape → must be $VAR)
// A strong/structured credential fails EVERY one of these tight shapes, so it can
// only be a $VAR. That is the convergence: the value shape is now as tight as the
// column's, not an entropy floor.
const VALUE_FLAG_SHAPE = {
  u: "dbname", user: "dbname", username: "dbname",
  d: "dbname", dbname: "dbname", db: "dbname", database: "dbname",
  h: "host", host: "host", hostname: "host",
  port: "port",
  secret: "dbname", // gcloud resource NAME — same tight shape, else $VAR
};
function flagBareName(tok) {
  return tok.replace(/^--?/, "").toLowerCase();
}
function isValueFlagAllowingBare(name) {
  return Object.prototype.hasOwnProperty.call(VALUE_FLAG_SHAPE, name);
}

// Does `bareVal` satisfy the TYPED shape a given value-flag requires?
// Reuses the SAME tight shapes the columns use (isDbNameShape / isHostShape),
// NOT a wide identifier regex — so a strong/random credential fails.
function flagValueMatchesTypedShape(name, bareVal) {
  const shape = VALUE_FLAG_SHAPE[name];
  if (shape === "port") return /^\d+$/.test(bareVal);
  // host flag value uses the STRICT command hostname (or IPv4/localhost/short
  // service label) — NOT the loose column shape — so `-h <dotted-token>` fails.
  if (shape === "host") {
    return bareVal === "localhost" || IPV4.test(bareVal) ||
      STRICT_CMD_HOSTNAME.test(bareVal) || BARE_HOST_LABEL.test(bareVal);
  }
  if (shape === "dbname") return isDbNameShape(bareVal);
  return false;
}

// The SAFE non-$VAR shapes ANY token may take (standalone or after any flag):
// a real network endpoint (dotted-DNS / IPv4 / localhost), a .env dotfile, or a
// curated CLI word. NO bare host-label, NO db-name-shape — those are
// password-ambiguous and are ONLY allowed right after an allowlisted value-flag.
// A URL whose authority is a STRICT hostname/IP/localhost and which carries NO
// embedded credential (`user:pw@` is caught by EMBEDDED_CRED separately). The
// host part must pass the strict shape, so a `http://<dotted-token>` cannot
// launder a secret as a URL either. Path/query are allowed but the WHOLE token
// is still run through the secret backstop by validateCommand.
const SAFE_URL =
  /^[a-z][a-z0-9+.\-]*:\/\/(?:localhost|\d{1,3}(?:\.\d{1,3}){3}|(?:[a-z0-9](?:[a-z0-9-]{0,22}[a-z0-9])?\.)+[a-z]{2,})(?::\d+)?(?:[/?#]\S*)?$/;

function isSafeNonSecretToken(bare) {
  if (bare === "localhost") return true;
  if (IPV4.test(bare)) return true;
  // STRICT command hostname (lowercase labels ≤24, alpha TLD) — NOT the loose
  // DOTTED_HOSTNAME, which let a dotted high-entropy token launder through.
  if (STRICT_CMD_HOSTNAME.test(bare)) return true;
  if (SAFE_URL.test(bare)) return true; // scheme://strict-host/… (no user:pw@)
  if (DOTFILE_TOKEN.test(bare)) return true;
  if (CLI_WORDS.has(bare.toLowerCase())) return true;
  return false;
}

// Classify ONE command token WITHOUT adjacency (attached flag values + standalone
// args). Returns null if safe, else a reason string.
function classifyCommandToken(tok) {
  const bare = tok.replace(/^["']/, "").replace(/["']$/, "");
  if (bare === "") return null;

  // 1. $VAR — the only way a secret appears.
  if (isVarToken(tok, bare)) return null;

  // 2. `--flag=value` — an allowlisted value-flag may carry a bare identifier;
  //    any OTHER flag's attached value must be a $VAR or a safe non-secret shape.
  const eqMatch = bare.match(/^(--?[A-Za-z][A-Za-z0-9-]*)=(.*)$/);
  if (eqMatch) {
    const name = flagBareName(eqMatch[1]);
    const value = eqMatch[2];
    if (value === "") return null;
    return classifyFlagValue(eqMatch[1] + "=", name, value);
  }

  // 3. glued short flag `-pVALUE`. If the letter is `p` it's PORT (digits ok);
  //    an allowlisted value-flag letter may carry a bare identifier; otherwise
  //    the glued value must be a $VAR / safe shape.
  const gluedMatch = bare.match(/^(-[A-Za-z])(.+)$/);
  if (gluedMatch) {
    const name = flagBareName(gluedMatch[1]);
    return classifyFlagValue(gluedMatch[1], name, gluedMatch[2]);
  }

  // 4. a bare flag NAME with no attached value.
  if (isBareFlag(bare)) return null;

  // 5. a safe non-secret shape: endpoint / dotfile / curated word.
  if (isSafeNonSecretToken(bare)) return null;

  // 6. anything else → REJECT (a bare literal — password-ambiguous by shape).
  return `bare argument "${bare}" is not a $VAR reference, a flag, a dotted ` +
    `hostname/IP, a .env file, nor a curated CLI word — it is a probable inline ` +
    `literal secret. Move it to an env var and reference it as $VAR ` +
    `(e.g. psql "$DATABASE_URL_PROD")`;
}

// A flag's VALUE (attached `=`, glued, or — via classifyCommand — the next
// token). `name` is the flag's bare name. An allowlisted value-flag may carry a
// bare literal ONLY if it matches that flag's TYPED shape (port=digits,
// host=host-shape, user/db/secret=tight db-name shape); a strong/random
// credential fails the shape → must be a $VAR. EVERY other flag's value must be
// a $VAR or a safe non-secret shape. Returns null if safe.
function classifyFlagValue(flagPart, name, value) {
  const bareVal = value.replace(/^["']/, "").replace(/["']$/, "");
  if (isVarToken(value, bareVal)) return null;
  if (isSafeNonSecretToken(bareVal)) return null; // dotted host / IP / dotfile / curated
  if (isValueFlagAllowingBare(name) && flagValueMatchesTypedShape(name, bareVal)) return null;
  return `flag "${flagPart}" carries a bare literal value "${bareVal}" — a value-flag ` +
    `may hold only its TYPED shape (--port=digits, --host=hostname/IP, ` +
    `--user/--dbname=short lowercase identifier); a strong/random token fails that ` +
    `shape and every other flag's value must be a $VAR reference ` +
    `(e.g. --password "$DB_PASSWORD"). A bare literal here is a probable secret.`;
}

// Validate a full command with TOKEN-ADJACENCY. A bare flag NAME followed by a
// value token: the value belongs to that flag and is checked by classifyFlagValue
// with the flag's name — so `-U binvoice` passes (allowlisted) but
// `--password swordfish` is REJECTED (not allowlisted → value must be $VAR).
// Returns null if the whole command is safe, else a reason string.
function classifyCommand(s) {
  const tokens = tokenizeCommand(s);
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    const bare = tok.replace(/^["']/, "").replace(/["']$/, "");

    if (isBareFlag(bare) && !isVarToken(tok, bare)) {
      const next = tokens[i + 1];
      if (next !== undefined) {
        const nextBare = next.replace(/^["']/, "").replace(/["']$/, "");
        const nextIsFlag = /^-/.test(nextBare);
        if (!nextIsFlag) {
          // next token is THIS flag's value — classify it with this flag's name.
          const reason = classifyFlagValue(bare, flagBareName(bare), next);
          if (reason) return reason;
          i++; // consume the value token
          continue;
        }
      }
      continue; // bare flag with no following value
    }
    const reason = classifyCommandToken(tok);
    if (reason) return reason;
  }
  return null;
}

function validateCommand(field, v) {
  const s = optStr(v);
  if (s === "") return;
  // Backstop first (known prefixes / JWT / base64 / hex / embedded cred).
  rejectSecret(field, s);
  // PRIMARY structural guard: adjacency-aware command grammar (a flag's value —
  // attached, glued, OR the next token — must be $VAR or a safe non-secret shape).
  const reason = classifyCommand(s);
  if (reason) {
    throw new Error(
      `recordEnvironment: ${field} rejected — ${reason} ` +
        `A command may contain only a tool, flags, $VAR/\${VAR} references, dotted ` +
        `hostnames/IPs, .env dotfiles, and curated CLI/subcommand words; a bare ` +
        `literal value is forbidden. Put the value in an env var and reference it ` +
        `as $VAR (e.g. psql "$DATABASE_URL_PROD").`
    );
  }
}

// ─── Gotchas ENUMERATED (no free prose) ──────────────────────────────────────
//
// Free prose gave a secret somewhere to hide. `gotchas` is now an enumerated /
// short-token column: a comma/space-separated list drawn from a fixed enum,
// plus an optional `via <hostname/identifier>` qualifier. Anything else THROWS.

const GOTCHA_ENUM = new Set([
  "vpn", "ip-allowlist", "ssh-tunnel", "bastion", "none",
]);

function validateGotchas(v) {
  const s = optStr(v);
  if (s === "") return;
  rejectSecret("access gotchas", s);
  // Tokenize on commas and whitespace.
  const tokens = s.split(/[,\s]+/).filter(Boolean);
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i].toLowerCase();
    if (GOTCHA_ENUM.has(t)) continue;
    if (t === "via") {
      // the NEXT token must be a POSITIVE host shape (dotted DNS / IPv4 /
      // localhost / short service label) — never a free literal.
      const next = tokens[i + 1];
      if (!next) {
        throw new Error(`recordEnvironment: access gotchas — "via" must be followed by a hostname/identifier`);
      }
      if (!isHostShape(next)) {
        throw new Error(
          `recordEnvironment: access gotchas — "via ${next}" target must be a hostname/IP ` +
            `(dotted DNS, IPv4, localhost, or a short lowercase service name), got "${next}"`
        );
      }
      i++; // consume the hostname token
      continue;
    }
    // A standalone POSITIVE host shape is allowed (naming a bastion directly).
    if (isHostShape(tokens[i])) {
      continue;
    }
    throw new Error(
      `recordEnvironment: access gotchas must be an enumerated list ` +
        `(vpn | ip-allowlist | ssh-tunnel | bastion | none), optionally with ` +
        `"via <hostname>" — got "${tokens[i]}". Free prose is forbidden (nowhere for a secret to hide).`
    );
  }
}

// Run the full per-column allowlist + marker-smuggle + secret backstop over a
// proposed row. Throws on the FIRST violation — the row is never written.
// ─── Per-project local-literal switch ────────────────────────────────────────
//
// A project may opt IN to allowing a LITERAL secret in `scope=local` rows (the
// user's testing convenience — "I don't care if you have the local password").
// Config: `.gsd-t/env-registry-config.json` → `{ "allowLocalLiteral": true }`.
// Default OFF → strict everywhere (even local rows use $VAR). staging/prod are
// ALWAYS strict — the switch NEVER relaxes them. A relaxed local row STILL runs
// the marker-smuggle guard (a literal secret is fine; corrupting the doc block
// is not). recordEnvironment returns `localLiteralWarning:true` on a relaxed
// write so the caller can print the one-time "committed file → git history" note.
function readEnvRegistryConfig(projectDir) {
  if (!projectDir) return { allowLocalLiteral: false };
  const p = path.join(projectDir, ".gsd-t", "env-registry-config.json");
  try {
    const cfg = JSON.parse(fs.readFileSync(p, "utf8"));
    return { allowLocalLiteral: cfg && cfg.allowLocalLiteral === true };
  } catch (_) {
    return { allowLocalLiteral: false }; // absent / invalid → strict (no silent relax)
  }
}

function validateRow(opts, relaxSecrets) {
  // Marker-smuggling guard FIRST, on EVERY user-supplied field — ALWAYS run, even
  // when secrets are relaxed for a local row (a literal secret is allowed there;
  // corrupting the marked doc block is NEVER allowed).
  for (const [field, value] of Object.entries({
    scope: opts.scope,
    kind: opts.kind,
    host: opts.host,
    port: opts.port,
    name: opts.name,
    authMethod: opts.authMethod,
    secretVault: opts.secretVault,
    secretEnvVarName: opts.secretEnvVarName,
    fetchCommand: opts.fetchCommand,
    connectCommand: opts.connectCommand,
    gotchas: opts.gotchas,
  })) {
    rejectMarkerSmuggle(field, value);
  }

  // scope/kind/port/vault/env-var-NAME are STRUCTURAL (enum/digits/UPPER_SNAKE)
  // and stay strict even when relaxed — they can't hold a free-form secret and a
  // malformed one breaks parsing.
  validateScope(opts.scope);
  validateKind(opts.kind);
  validatePort(opts.port);
  validateVault(opts.secretVault);
  validateEnvVarName(opts.secretEnvVarName);

  // The free-ish, secret-capable columns. Relaxed ONLY for an opted-in local row.
  if (relaxSecrets) return;

  validateHost("host", opts.host);
  validateName(opts.name);
  validateAuthMethod(opts.authMethod);
  validateCommand("fetch command", opts.fetchCommand);
  validateCommand("connect command", opts.connectCommand);
  validateGotchas(opts.gotchas);
}

// ─── Table serialization ─────────────────────────────────────────────────────

function escapeCell(v) {
  if (v === undefined || v === null || v === "") return "—";
  return String(v).replace(/\|/g, "\\|").replace(/\n/g, " ").trim();
}

function rowToLine(row) {
  return "| " + ENV_COLUMNS.map((c) => escapeCell(row[c])).join(" | ") + " |";
}

function headerLines() {
  return [
    "| " + ENV_COLUMNS.join(" | ") + " |",
    "| " + ENV_COLUMNS.map(() => "---").join(" | ") + " |",
  ];
}

// Build the full marker-delimited block from a list of row objects.
function buildTableBlock(rows) {
  const lines = [
    ENV_MARKER_START,
    "## Environments",
    "",
    "> **Map, not secrets.** This table records only WHERE an environment lives and",
    "> HOW to reach it — host/port/name/auth-method/which-vault-holds-the-secret/the",
    "> env-var NAME/the fetch + connect commands. It NEVER stores a secret VALUE.",
    "> The value lives in the vault (`.env` / Vercel / Neon / Google Secret Manager)",
    "> and is pulled at runtime via the env-var NAME. A missing row → HALT and",
    "> document (detect → ask → record → proceed); never guess a connection string,",
    "> never grep transcripts to rediscover.",
    "",
    ...headerLines(),
    ...rows.map(rowToLine),
    ENV_MARKER_END,
  ];
  return lines.join("\n");
}

// ─── Table parsing ───────────────────────────────────────────────────────────

function infraDocPath(projectDir) {
  return path.join(projectDir, "docs", "infrastructure.md");
}

// Uses the ONE shared reader from gsd-t-doc-marker.cjs (complement of the shared
// writer this file already calls) — no inline re-implementation. The verify gate
// keeps its OWN independent copy on purpose (defensive independence).
function extractBlock(content) {
  return extractMarkedDocBlock(content, ENV_MARKER_START, ENV_MARKER_END);
}

function splitRow(line) {
  // Strip the leading/trailing pipe, split on unescaped pipes.
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

// Parse the Environments table into an array of row objects keyed by column.
function parseRows(projectDir) {
  const target = infraDocPath(projectDir);
  if (!fs.existsSync(target)) return [];
  const content = fs.readFileSync(target, "utf8");
  const block = extractBlock(content);
  if (!block) return [];

  const rows = [];
  const lines = block.split("\n");
  for (const line of lines) {
    if (!line.trim().startsWith("|")) continue;
    const cells = splitRow(line);
    // Skip the header row and the separator row.
    if (cells[0] === "id") continue;
    if (cells.every((c) => /^-{1,}$/.test(c) || c === "")) continue;
    const row = {};
    ENV_COLUMNS.forEach((col, i) => {
      const raw = cells[i] === undefined ? "" : cells[i];
      row[col] = raw === "—" ? "" : raw;
    });
    rows.push(row);
  }
  return rows;
}

// ─── recordEnvironment — upsert by (scope, kind) ─────────────────────────────

function recordEnvironment(opts = {}) {
  const {
    projectDir,
    scope,
    kind,
    host,
    port,
    name,
    authMethod,
    secretVault,
    secretEnvVarName,
    fetchCommand,
    connectCommand,
    gotchas,
  } = opts;

  if (!projectDir) throw new Error("recordEnvironment: projectDir is required");
  if (!scope) throw new Error("recordEnvironment: scope is required");
  if (!kind) throw new Error("recordEnvironment: kind is required");

  // Per-project local-literal switch: relax the secret checks ONLY for a
  // scope=local row in a project that opted in. staging/prod ALWAYS strict.
  const { allowLocalLiteral } = readEnvRegistryConfig(projectDir);
  const relaxSecrets = allowLocalLiteral && scope === "local";

  // HARD CONSTRAINT: per-column allowlist + marker-smuggle + secret backstop.
  // Reject the ENTIRE row before any coercion or disk write. (relaxSecrets skips
  // ONLY the free-form secret-capable columns for an opted-in local row.)
  validateRow(opts, relaxSecrets);

  // Destructive-Action Guard: prod defaults read-only=YES unless explicitly set.
  // Coerce any non-string/boolean input to a YES/NO string (never literal
  // "false"/0/null leaking into the doc).
  let readOnlyDefault = opts.readOnlyDefault;
  if (readOnlyDefault === undefined || readOnlyDefault === null || readOnlyDefault === "") {
    readOnlyDefault = scope === "prod" ? "YES" : "NO";
  } else if (typeof readOnlyDefault === "boolean") {
    readOnlyDefault = readOnlyDefault ? "YES" : "NO";
  } else {
    const s = String(readOnlyDefault).trim().toLowerCase();
    readOnlyDefault = ["yes", "true", "1", "y"].includes(s) ? "YES" : "NO";
  }

  const recorded = new Date().toISOString();
  const id = `${scope}-${kind}`;

  const row = {
    id,
    scope,
    kind,
    host,
    port,
    "db/name": name,
    "auth method": authMethod,
    "secret vault": secretVault,
    "secret env-var NAME": secretEnvVarName,
    "fetch command": fetchCommand,
    "connect command": connectCommand,
    "access gotchas": gotchas,
    "read-only default": readOnlyDefault,
    recorded,
  };

  // (row is already fully validated above by validateRow — allowlist-per-column
  // + marker-smuggle guard + entropy/prefix secret backstop.)
  // Upsert by (scope, kind): replace the existing row with the same key, else
  // append. This is what self-heals staleness (Aiven → Neon replaces the row).
  const rows = parseRows(projectDir);
  const key = (r) => `${r.scope} ${r.kind}`;
  const thisKey = `${scope} ${kind}`;

  // Detect a DIFFERENT host replacing the same (scope,kind) — surface it so a
  // second real environment doesn't silently vanish into an upsert.
  const prior = rows.find((r) => key(r) === thisKey);
  const replaced = !!prior;
  const oldHost = prior ? prior.host : undefined;
  const newHost = optStr(host);
  const warnedHostChange = replaced && !!oldHost && !!newHost && oldHost !== newHost;

  const kept = rows.filter((r) => key(r) !== thisKey);
  kept.push(row);

  const block = buildTableBlock(kept);
  const target = infraDocPath(projectDir);
  upsertMarkedDocBlock(target, ENV_MARKER_START, ENV_MARKER_END, block);

  const result = Object.assign({}, row, { replaced });
  if (warnedHostChange) {
    result.warnedHostChange = true;
    result.oldHost = oldHost;
    result.newHost = newHost;
  }
  if (relaxSecrets) {
    result.localLiteralWarning = true;
    result.localLiteralNote =
      "docs/infrastructure.md is a COMMITTED file — a literal secret in this " +
      "local row enters git history. It is allowed only because this project set " +
      "allowLocalLiteral:true in .gsd-t/env-registry-config.json (local scope only).";
  }
  return result;
}

// ─── lookupEnvironment — read-first (No-Re-Research) ─────────────────────────
//
// Returns the row for (scope, kind) or null. On null the CALLER HALTs and
// documents — this module intentionally emits NO guessed connection string and
// has NO transcript-grep rediscovery path. There is no fallback here by design.

function lookupEnvironment(projectDir, scope, kind) {
  const rows = parseRows(projectDir);
  const match = rows.find((r) => r.scope === scope && r.kind === kind);
  return match || null;
}

// ─── Leak detection + remediation PROPOSAL (interactive capture trigger) ─────
//
// The silent guard REJECTS a command carrying a literal secret. But when a HUMAN
// is present (the brownfield capture trigger / a provisioning task), a bare
// rejection isn't enough — the user asked to be TOLD and OFFERED a fix: move a
// (possibly rotated) secret into the vault and replace the literal with a $VAR.
//
// This is DETECTION + a structured PROPOSAL only. The actual rotate-vs-move
// decision + vault write happen in the command-file workflow WITH the user (the
// module never rotates or writes a vault by itself, and never prompts).

// Pull the leaked secret out of a command/URL so it can be named + reported.
// Returns { leaked:true, secret, kind, rewriteHint } or { leaked:false }.
function detectCommandLeak(command) {
  const s = optStr(command);
  if (s === "") return { leaked: false };

  // 1. embedded credential in a URL: proto://user:PASSWORD@host
  const embedded = s.match(/([a-z][a-z0-9+.\-]*):\/\/([^\s:/@]+):((?!\$)[^\s:/@]+)@/i);
  if (embedded) {
    return {
      leaked: true,
      secret: embedded[3],
      kind: "url-embedded-credential",
      rewriteHint: s.replace(embedded[3], "$SECRET"),
    };
  }

  // 2. a token the classifier rejects — walk tokens, find the offending literal.
  const reason = classifyCommand(s);
  if (!reason) return { leaked: false };
  // Extract the quoted-out bare literal the reason names, else flag the command.
  const m = reason.match(/value "([^"]+)"|argument "([^"]+)"/);
  const secret = m ? (m[1] || m[2]) : null;
  return {
    leaked: true,
    secret,
    kind: "inline-literal",
    rewriteHint: secret ? s.replace(secret, "$SECRET") : s,
    reason,
  };
}

// Build a remediation proposal the workflow presents to the user. It does NOT
// decide rotate-vs-move (the user does) and does NOT touch a vault. `envVarName`
// is a suggested UPPER_SNAKE name for the moved secret.
function proposeRemediation(projectDir, command, opts = {}) {
  const leak = detectCommandLeak(command);
  if (!leak.leaked) return { needed: false };
  const detected = projectDir ? detectEnvConfig(projectDir) : { vault: "local (.env)", fetchCommand: "read from .env" };
  const envVarName = opts.envVarName ||
    (leak.kind === "url-embedded-credential" ? "DATABASE_URL" : "DB_SECRET");
  const rewritten = leak.secret
    ? command.replace(leak.secret, "$" + envVarName)
    : command;
  return {
    needed: true,
    leakKind: leak.kind,
    detectedSecret: leak.secret, // shown to the user so they SEE what leaked
    vault: detected.vault,
    fetchCommand: detected.fetchCommand,
    suggestedEnvVarName: envVarName,
    rewrittenCommand: rewritten,
    // The two paths the workflow must ASK the user to choose between:
    choices: {
      rotate: "Generate/request a NEW secret (the old one is compromised — it " +
        "was about to enter a committed file / is already exposed), store the new " +
        "one in the vault, use $" + envVarName + " in the command.",
      move: "Move the EXISTING secret into the vault as-is and reference it as $" +
        envVarName + " (faster; does not un-expose it if already committed).",
    },
    note: "Ask the user rotate-vs-move; then store to the vault (directly where " +
      "possible, else instruct the user) and record the row with the $VAR command.",
  };
}

// ─── detectEnvConfig — reuse the detectStack SHAPE (map only, never a value) ──
//
// Reads .env.example / .env var NAMES, connection-string shapes, and
// vercel/neon/gcloud presence to PROPOSE a vault + fetch command. Records the
// map only — it NEVER reads or emits a secret value.

function readEnvVarNames(projectDir) {
  const names = new Set();
  for (const f of [".env.example", ".env.sample", ".env.template"]) {
    const p = path.join(projectDir, f);
    if (!fs.existsSync(p)) continue;
    let content;
    try {
      content = fs.readFileSync(p, "utf8");
    } catch (_) {
      continue;
    }
    for (const line of content.split("\n")) {
      const m = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=/);
      if (m) names.add(m[1]);
    }
  }
  return Array.from(names);
}

function fileExists(projectDir, rel) {
  return fs.existsSync(path.join(projectDir, rel));
}

function readPkgDeps(projectDir) {
  const pkgPath = path.join(projectDir, "package.json");
  let pkg = {};
  try {
    pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  } catch (_) {
    return [];
  }
  const deps = Object.assign({}, pkg.dependencies || {}, pkg.devDependencies || {});
  return Object.keys(deps).map((d) => d.toLowerCase());
}

function detectEnvConfig(projectDir) {
  if (!projectDir) throw new Error("detectEnvConfig: projectDir is required");

  const secretEnvVarNames = readEnvVarNames(projectDir);
  const depNames = readPkgDeps(projectDir);

  // Vault detection — convention-based, grounded in the 3 real inspected
  // projects. Precedence: an explicit platform marker wins over plain .env.
  const hasVercel = fileExists(projectDir, "vercel.json") || fileExists(projectDir, ".vercel");
  const hasGoogle =
    fileExists(projectDir, "cloudbuild.yaml") ||
    fileExists(projectDir, "cloudbuild.yml") ||
    fileExists(projectDir, ".gcloudignore");
  const hasNeon =
    depNames.some((d) => d === "@neondatabase/serverless" || d.includes("neon")) ||
    fileExists(projectDir, ".neon");

  let vault = "local (.env)";
  let fetchCommand = secretEnvVarNames[0]
    ? `read $${secretEnvVarNames[0]} from .env`
    : "read from .env";

  if (hasVercel) {
    vault = "Vercel";
    fetchCommand = "vercel env pull";
  } else if (hasGoogle) {
    vault = "Google Secret Manager";
    fetchCommand = "gcloud secrets versions access latest --secret=<name>";
  } else if (hasNeon) {
    vault = "Neon";
    fetchCommand = "neonctl connection-string";
  }

  return {
    vault,
    fetchCommand,
    secretEnvVarNames,
    signals: { hasVercel, hasGoogle, hasNeon },
    detectedFrom: path.join(projectDir, "package.json"),
  };
}

// ─── addPermissionEntry — broad-glob allow-entry per tool ────────────────────
//
// Reuses the guarded-write scaffold pattern from bin/gsd-t.js (invalid-JSON
// guard + symlink guard + idempotent). Writes a BROAD GLOB per tool
// (Bash(psql:*)), NOT the exact command string — the user-locked decision.

function isSymlink(filePath) {
  try {
    return fs.lstatSync(filePath).isSymbolicLink();
  } catch (_) {
    return false;
  }
}

// Derive the tool from the connect command's first meaningful token, skipping
// leading env-var assignments (FOO=bar psql ...) and a leading `sudo`.
function deriveTool(connectCommand) {
  if (!connectCommand || typeof connectCommand !== "string") return null;
  const tokens = connectCommand.trim().split(/\s+/);
  let i = 0;
  while (i < tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[i])) i++;
  if (tokens[i] === "sudo") i++;
  const tool = tokens[i];
  if (!tool) return null;
  // Base name only (strip any path).
  const base = tool.split("/").pop();
  if (!base) return null;
  // Reject a tool token carrying shell metacharacters — emitting Bash(psql;:*)
  // (or worse) into the permission allowlist would be broken junk / an injection
  // vector. A real tool name is plain `[A-Za-z0-9._-]`. Anything else → null
  // (no permission entry written).
  if (!/^[A-Za-z0-9._-]+$/.test(base)) return null;
  return base;
}

function addPermissionEntry(projectDir, connectCommand) {
  if (!projectDir) throw new Error("addPermissionEntry: projectDir is required");
  const tool = deriveTool(connectCommand);
  if (!tool) return { added: false, tool: null, entry: null, reason: "no tool derivable" };

  const entry = `Bash(${tool}:*)`;
  const settingsPath = path.join(projectDir, ".claude", "settings.json");

  let settings = {};
  if (fs.existsSync(settingsPath)) {
    try {
      settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
      if (!settings || typeof settings !== "object") settings = {};
    } catch (_) {
      // invalid-JSON guard — do not clobber, report noop
      return { added: false, tool, entry, reason: "settings.json has invalid JSON" };
    }
  }

  if (!settings.permissions || typeof settings.permissions !== "object") settings.permissions = {};
  if (!Array.isArray(settings.permissions.allow)) settings.permissions.allow = [];

  if (settings.permissions.allow.includes(entry)) {
    return { added: false, tool, entry, reason: "already present" };
  }

  if (isSymlink(settingsPath)) {
    return { added: false, tool, entry, reason: "settings.json is a symlink" };
  }

  settings.permissions.allow.push(entry);

  const dir = path.dirname(settingsPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n", "utf8");

  return { added: true, tool, entry };
}

// ─── ensureEnvGitignored — auto-add + report (user-locked decision) ──────────

function ensureEnvGitignored(projectDir) {
  if (!projectDir) throw new Error("ensureEnvGitignored: projectDir is required");
  const gitignorePath = path.join(projectDir, ".gitignore");

  if (isSymlink(gitignorePath)) {
    return { added: false, reason: ".gitignore is a symlink" };
  }

  let content = "";
  if (fs.existsSync(gitignorePath)) content = fs.readFileSync(gitignorePath, "utf8");

  const lines = content.split("\n").map((l) => l.trim());
  // A broad `.env*` rule (or `*.env`) already covers every variant.
  const hasBroadRule = lines.some((l) => l === ".env*" || l === "/.env*" || l === "*.env");

  // Collect the env files actually present in the project — `.env`, `.env.local`,
  // `.env.production`, etc. Each MUST be gitignored; a bare `.env` rule does NOT
  // cover `.env.production`, so leaving it tracked would leak secrets.
  let present = [];
  try {
    present = fs
      .readdirSync(projectDir)
      .filter((f) => f === ".env" || /^\.env\.[^/\\]+$/.test(f));
  } catch (_) {
    present = [];
  }
  // Always ensure at least a bare `.env` intent even if none is present yet.
  const required = new Set([".env", ...present]);

  const ignored = new Set(lines);
  const isCovered = (name) =>
    hasBroadRule || ignored.has(name) || ignored.has("/" + name);

  const missing = [...required].filter((name) => !isCovered(name));
  if (missing.length === 0) return { added: false, reason: "already gitignored" };

  // Prefer a single broad `.env*` rule when more than one variant is present or
  // missing — it future-proofs against new `.env.*` files.
  const additions =
    missing.length > 1 || present.some((f) => f !== ".env") ? [".env*"] : missing;

  const next =
    content.replace(/\s*$/, "") +
    (content ? "\n" : "") +
    additions.join("\n") +
    "\n";
  fs.writeFileSync(gitignorePath, next, "utf8");
  return { added: true, rules: additions };
}

module.exports = {
  recordEnvironment,
  lookupEnvironment,
  detectEnvConfig,
  detectCommandLeak,
  proposeRemediation,
  readEnvRegistryConfig,
  addPermissionEntry,
  ensureEnvGitignored,
  deriveTool,
  looksLikeInlineSecret,
  looksLikeSecretValue,
  isHostShape,
  isDbNameShape,
  isSafeBareArg,
  classifyCommandToken,
  classifyCommand,
  classifyFlagValue,
  isSafeNonSecretToken,
  isValueFlagAllowingBare,
  flagValueMatchesTypedShape,
  VALUE_FLAG_SHAPE,
  tokenizeCommand,
  AUTH_METHODS,
  CLI_WORDS,
  ENV_COLUMNS,
  ENV_MARKER_START,
  ENV_MARKER_END,
};

// ─── CLI arm (so sandboxed workflows can call via Bash) ──────────────────────

if (require.main === module) {
  const args = process.argv.slice(2);
  const sub = args[0];
  const out = (obj) => process.stdout.write(JSON.stringify(obj, null, 2) + "\n");

  try {
    if (sub === "record") {
      // node gsd-t-env-registry.cjs record '<json-opts>'
      const opts = JSON.parse(args[1] || "{}");
      out({ ok: true, row: recordEnvironment(opts) });
    } else if (sub === "lookup") {
      // node gsd-t-env-registry.cjs lookup <projectDir> <scope> <kind>
      const row = lookupEnvironment(args[1], args[2], args[3]);
      out({ ok: true, found: !!row, row });
    } else if (sub === "detect") {
      // node gsd-t-env-registry.cjs detect <projectDir>
      out({ ok: true, detected: detectEnvConfig(args[1]) });
    } else if (sub === "add-permission") {
      // node gsd-t-env-registry.cjs add-permission <projectDir> '<connectCommand>'
      out({ ok: true, result: addPermissionEntry(args[1], args[2]) });
    } else if (sub === "ensure-gitignore") {
      // node gsd-t-env-registry.cjs ensure-gitignore <projectDir>
      out({ ok: true, result: ensureEnvGitignored(args[1]) });
    } else if (sub === "detect-leak") {
      // node gsd-t-env-registry.cjs detect-leak '<command>'
      out({ ok: true, result: detectCommandLeak(args[1]) });
    } else if (sub === "propose-remediation") {
      // node gsd-t-env-registry.cjs propose-remediation <projectDir> '<command>' [envVarName]
      out({ ok: true, result: proposeRemediation(args[1], args[2], args[3] ? { envVarName: args[3] } : {}) });
    } else {
      out({
        ok: false,
        error:
          "usage: env-registry <record|lookup|detect|detect-leak|propose-remediation|add-permission|ensure-gitignore> ...",
      });
      process.exit(2);
    }
  } catch (e) {
    out({ ok: false, error: e.message });
    process.exit(1);
  }
}
