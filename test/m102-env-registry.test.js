"use strict";

/**
 * M102 — Environment Registry. Covers the 9 acceptance criteria.
 *
 * [RULE] env-registry-map-only
 * [RULE] env-registry-halt-not-fallback
 * [RULE] env-registry-upsert-by-scope-kind
 * [RULE] env-registry-prod-readonly
 * [RULE] env-registry-shared-writer
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const ROOT = path.join(__dirname, "..");
const reg = require(path.join(ROOT, "bin", "gsd-t-env-registry.cjs"));
const { check: envCheck } = require(path.join(ROOT, "bin", "gsd-t-env-registry-check.cjs"));

// Build a secret-shaped FIXTURE at runtime from a split prefix + body. The
// runtime string is byte-identical to a real token (so the guard is exercised
// exactly), but NO scannable `sk_live_`/`ghp_`/`AKIA…` literal exists on disk —
// GitHub push-protection / secret-scanners flag the LITERAL, not the concatenated
// value. These are all FAKE test tokens; splitting keeps them out of the scanner
// without weakening the test.
const S = (prefix, body) => prefix + body;

function mkTmpProject(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `gsdt-m102-${prefix}-`));
  fs.mkdirSync(path.join(dir, "docs"), { recursive: true });
  // seed the infra doc from the shipped template so markers exist.
  const tpl = fs.readFileSync(path.join(ROOT, "templates", "infrastructure.md"), "utf8");
  fs.writeFileSync(path.join(dir, "docs", "infrastructure.md"), tpl, "utf8");
  return dir;
}

function rmTmp(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch (_) {}
}

function infra(dir) {
  return fs.readFileSync(path.join(dir, "docs", "infrastructure.md"), "utf8");
}

// ─── AC1: template has the marker-delimited table, NO secret-value column ────

test("AC1: templates/infrastructure.md has the Environments markers and exact map-only columns; NO secret-value column", () => {
  const tpl = fs.readFileSync(path.join(ROOT, "templates", "infrastructure.md"), "utf8");
  assert.ok(tpl.includes("<!-- gsd-t-env-registry:start -->"));
  assert.ok(tpl.includes("<!-- gsd-t-env-registry:end -->"));
  assert.ok(tpl.includes("## Environments"));
  // exact columns
  for (const col of reg.ENV_COLUMNS) {
    assert.ok(tpl.includes(col), `template must carry column "${col}"`);
  }
  // no secret VALUE column — check the actual HEADER ROW, not incidental prose.
  const headerLine = tpl
    .split("\n")
    .find((l) => l.trim().startsWith("| id ") && l.includes("| scope "));
  assert.ok(headerLine, "the Environments header row must exist");
  const headerCols = headerLine
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim().toLowerCase());
  assert.deepEqual(headerCols, reg.ENV_COLUMNS.map((c) => c.toLowerCase()));
  assert.ok(
    !headerCols.some((c) => /secret\s*value|^value$/.test(c)),
    "there must be NO secret-value column in the header"
  );
});

// ─── AC2 + greenfield record-at-create ───────────────────────────────────────

test("AC2: recordEnvironment writes a map row into docs/infrastructure.md in one call", () => {
  const dir = mkTmpProject("greenfield");
  try {
    reg.recordEnvironment({
      projectDir: dir,
      scope: "local",
      kind: "postgres",
      host: "localhost",
      port: "5432",
      name: "appdb",
      authMethod: "password",
      secretVault: "local (.env)",
      secretEnvVarName: "DATABASE_URL",
      fetchCommand: "read $DATABASE_URL from .env",
      connectCommand: 'psql "$DATABASE_URL"',
    });
    const content = infra(dir);
    assert.ok(content.includes("local-postgres"));
    assert.ok(content.includes("DATABASE_URL"));
    assert.ok(content.includes('psql "$DATABASE_URL"'));
    // never a literal secret value — only the NAME + $VAR reference. (The
    // doctrine note prose legitimately contains "secret VALUE"; we assert no
    // secret-SHAPED literal is present in a row instead.)
    assert.equal(envCheck(dir).ok, true, "written row must pass the no-secret lint");
  } finally {
    rmTmp(dir);
  }
});

// ─── AC6: upsert by (scope,kind) replaces the stale row (Aiven -> Neon) ───────

test("AC6: re-provision upserts by (scope,kind) — Aiven row REPLACED by Neon, ONE row remains", () => {
  const dir = mkTmpProject("reprovision");
  try {
    reg.recordEnvironment({
      projectDir: dir,
      scope: "prod",
      kind: "postgres",
      host: "old.aivencloud.com",
      port: "5432",
      name: "defaultdb",
      authMethod: "password",
      secretVault: "local (.env)",
      secretEnvVarName: "DATABASE_URL_PROD",
      connectCommand: 'psql "$DATABASE_URL_PROD"',
    });
    reg.recordEnvironment({
      projectDir: dir,
      scope: "prod",
      kind: "postgres",
      host: "ep-neon.neon.tech",
      port: "5432",
      name: "neondb",
      authMethod: "password",
      secretVault: "Neon",
      secretEnvVarName: "DATABASE_URL_PROD",
      fetchCommand: "neonctl connection-string",
      connectCommand: 'psql "$DATABASE_URL_PROD"',
    });
    const content = infra(dir);
    assert.ok(!content.includes("aivencloud"), "stale Aiven host must be gone");
    assert.ok(content.includes("neon.tech"), "Neon host must be present");
    // exactly one prod-postgres row
    const occurrences = (content.match(/prod-postgres/g) || []).length;
    assert.equal(occurrences, 1, "exactly one (prod,postgres) row must survive");

    const row = reg.lookupEnvironment(dir, "prod", "postgres");
    assert.equal(row.host, "ep-neon.neon.tech");
    assert.equal(row["secret vault"], "Neon");
  } finally {
    rmTmp(dir);
  }
});

// ─── AC4: reject an inline literal secret ───────────────────────────────────

test("AC4: recordEnvironment REJECTS a connect command with an inline literal password", () => {
  const dir = mkTmpProject("reject-conn");
  try {
    assert.throws(
      () =>
        reg.recordEnvironment({
          projectDir: dir,
          scope: "prod",
          kind: "postgres",
          host: "h",
          port: "5432",
          name: "db",
          authMethod: "password",
          secretVault: "local (.env)",
          secretEnvVarName: "DATABASE_URL_PROD",
          connectCommand: 'psql "postgres://admin:hunter2SuperSecret@h:5432/db"',
        }),
      /inline literal secret/i
    );
    // nothing written
    assert.ok(!/hunter2/.test(infra(dir)));
  } finally {
    rmTmp(dir);
  }
});

test("AC4: recordEnvironment REJECTS a fetch command with an inline literal token", () => {
  const dir = mkTmpProject("reject-fetch");
  try {
    assert.throws(
      () =>
        reg.recordEnvironment({
          projectDir: dir,
          scope: "prod",
          kind: "http-api",
          host: "api.example.com",
          authMethod: "token",
          secretVault: "local (.env)",
          secretEnvVarName: "API_TOKEN",
          fetchCommand: "curl -H 'api_key=" + S("sk", "_live_abcdef123456789") + "'",
          connectCommand: 'curl -H "Authorization: Bearer $API_TOKEN"',
        }),
      /inline literal secret/i
    );
  } finally {
    rmTmp(dir);
  }
});

test("AC4: a $VAR-referencing connect command is ACCEPTED (not a false positive)", () => {
  const dir = mkTmpProject("accept-var");
  try {
    const row = reg.recordEnvironment({
      projectDir: dir,
      scope: "prod",
      kind: "postgres",
      host: "h",
      port: "5432",
      name: "db",
      authMethod: "password",
      secretVault: "Neon",
      secretEnvVarName: "DATABASE_URL_PROD",
      fetchCommand: "neonctl connection-string",
      connectCommand: 'psql "$DATABASE_URL_PROD"',
    });
    assert.equal(row.scope, "prod");
  } finally {
    rmTmp(dir);
  }
});

// ─── AC5: prod defaults read-only=YES ────────────────────────────────────────

test("AC5: scope=prod defaults read-only=YES; non-prod defaults NO", () => {
  const dir = mkTmpProject("readonly");
  try {
    const prod = reg.recordEnvironment({
      projectDir: dir,
      scope: "prod",
      kind: "redis",
      host: "h",
      secretVault: "local (.env)",
      secretEnvVarName: "REDIS_URL_PROD",
      connectCommand: 'redis-cli -u "$REDIS_URL_PROD"',
    });
    assert.equal(prod["read-only default"], "YES");

    const local = reg.recordEnvironment({
      projectDir: dir,
      scope: "local",
      kind: "redis",
      host: "localhost",
      secretVault: "local (.env)",
      secretEnvVarName: "REDIS_URL",
      connectCommand: 'redis-cli -u "$REDIS_URL"',
    });
    assert.equal(local["read-only default"], "NO");
  } finally {
    rmTmp(dir);
  }
});

// ─── AC3: lookup returns null when absent; NO fallback path exists ───────────

test("AC3: lookupEnvironment returns null when the entry is absent (caller HALTs)", () => {
  const dir = mkTmpProject("lookup-null");
  try {
    assert.equal(reg.lookupEnvironment(dir, "prod", "postgres"), null);
  } finally {
    rmTmp(dir);
  }
});

test("AC3: the registry module contains NO guessed-connstring / transcript-grep fallback path", () => {
  const rawSrc = fs.readFileSync(path.join(ROOT, "bin", "gsd-t-env-registry.cjs"), "utf8");
  // Strip line + block comments so incidental prose ("never grep transcripts")
  // and the secret-shape REGEX literals don't count as behavior.
  const code = rawSrc
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    // strip regex/string literals that legitimately MENTION connstring shapes
    // for the secret-shape guard (INLINE_CONNSTRING_SECRET / INLINE_KV_SECRET).
    .replace(/INLINE_CONNSTRING_SECRET[\s\S]*?;/g, "")
    .replace(/INLINE_KV_SECRET[\s\S]*?;/g, "");

  // No transcript-reading rediscovery CODE. The doctrine prose ("never grep
  // transcripts") legitimately mentions the word inside a doc STRING that gets
  // written into the table note; that is guidance, not a rediscovery path. What
  // must NOT exist is fs code that reads a transcripts store to rediscover a
  // connection. Assert no fs read is aimed at a transcript(s) path.
  assert.ok(
    !/(readFileSync|readdirSync|readFile|readdir)\([^)]*transcript/i.test(code),
    "module must have no transcript-rediscovery fs read"
  );
  // No literal connection string CONSTRUCTED as a fallback for a missing row.
  assert.ok(
    !/["'`]\s*postgres(?:ql)?:\/\//i.test(code),
    "module must not build a literal postgres:// connection string"
  );
  // lookupEnvironment returns match || null — no synthesized fallback row.
  assert.ok(/return match \|\| null/.test(rawSrc));
});

// ─── AC7: detectEnvConfig records the right vault per convention, no secret ──

test("AC7: detectEnvConfig — vercel.json -> Vercel vault, no secret value", () => {
  const dir = mkTmpProject("detect-vercel");
  try {
    fs.writeFileSync(path.join(dir, "vercel.json"), "{}");
    fs.writeFileSync(path.join(dir, ".env.example"), "DATABASE_URL=\nAPI_KEY=\n");
    const d = reg.detectEnvConfig(dir);
    assert.equal(d.vault, "Vercel");
    assert.equal(d.fetchCommand, "vercel env pull");
    assert.deepEqual(d.secretEnvVarNames.sort(), ["API_KEY", "DATABASE_URL"]);
    // NAMES only, never a value
    assert.ok(!JSON.stringify(d).includes("=\n"));
  } finally {
    rmTmp(dir);
  }
});

test("AC7: detectEnvConfig — cloudbuild.yaml/.gcloudignore -> Google Secret Manager", () => {
  const dir = mkTmpProject("detect-google");
  try {
    fs.writeFileSync(path.join(dir, "cloudbuild.yaml"), "steps: []\n");
    fs.writeFileSync(path.join(dir, ".gcloudignore"), "node_modules\n");
    const d = reg.detectEnvConfig(dir);
    assert.equal(d.vault, "Google Secret Manager");
    assert.ok(/gcloud secrets versions access/.test(d.fetchCommand));
  } finally {
    rmTmp(dir);
  }
});

test("AC7: detectEnvConfig — plain .env -> local vault", () => {
  const dir = mkTmpProject("detect-local");
  try {
    fs.writeFileSync(path.join(dir, ".env.example"), "DATABASE_URL=\n");
    const d = reg.detectEnvConfig(dir);
    assert.equal(d.vault, "local (.env)");
    assert.equal(d.signals.hasVercel, false);
    assert.equal(d.signals.hasGoogle, false);
  } finally {
    rmTmp(dir);
  }
});

// ─── AC8: shared doc-writer + settings guard scaffold ───────────────────────

test("AC8: the doc-writer is SHARED — gsd-t-doc-marker.cjs exists and both scaffolder + registry require it", () => {
  const markerPath = path.join(ROOT, "bin", "gsd-t-doc-marker.cjs");
  assert.ok(fs.existsSync(markerPath), "shared writer module must exist");
  const scaffolder = fs.readFileSync(path.join(ROOT, "bin", "gsd-t-logging-scaffolder.cjs"), "utf8");
  const registry = fs.readFileSync(path.join(ROOT, "bin", "gsd-t-env-registry.cjs"), "utf8");
  assert.ok(/require\(["'.\/]*gsd-t-doc-marker\.cjs["']\)/.test(scaffolder), "scaffolder must require the shared writer");
  assert.ok(/require\(["'.\/]*gsd-t-doc-marker\.cjs["']\)/.test(registry), "registry must require the shared writer");
  // and the shared module exports the function
  const marker = require(markerPath);
  assert.equal(typeof marker.upsertMarkedDocBlock, "function");
});

test("AC8: addPermissionEntry writes a Bash(<tool>:*) broad glob, idempotent, coexists with hooks, JSON/symlink guarded", () => {
  const dir = mkTmpProject("perm");
  try {
    // pre-existing settings with a hook — must be preserved.
    fs.mkdirSync(path.join(dir, ".claude"), { recursive: true });
    fs.writeFileSync(
      path.join(dir, ".claude", "settings.json"),
      JSON.stringify({ hooks: { PreToolUse: [{ matcher: "Write", hooks: [] }] } }, null, 2)
    );

    const r1 = reg.addPermissionEntry(dir, 'psql "$DATABASE_URL_PROD"');
    assert.equal(r1.added, true);
    assert.equal(r1.entry, "Bash(psql:*)");

    const settings = JSON.parse(fs.readFileSync(path.join(dir, ".claude", "settings.json"), "utf8"));
    assert.ok(settings.permissions.allow.includes("Bash(psql:*)"));
    assert.ok(settings.hooks.PreToolUse.length === 1, "existing hooks must be preserved");

    // idempotent
    const r2 = reg.addPermissionEntry(dir, 'psql "$DATABASE_URL_PROD"');
    assert.equal(r2.added, false);
    const settings2 = JSON.parse(fs.readFileSync(path.join(dir, ".claude", "settings.json"), "utf8"));
    assert.equal(settings2.permissions.allow.filter((e) => e === "Bash(psql:*)").length, 1);

    // derives the tool skipping env-var assignment prefixes
    assert.equal(reg.deriveTool("PGPASSWORD=x psql -h h"), "psql");
    assert.equal(reg.deriveTool("vercel env pull"), "vercel");
    assert.equal(reg.deriveTool("gcloud secrets versions access"), "gcloud");
  } finally {
    rmTmp(dir);
  }
});

test("AC8: addPermissionEntry guards invalid JSON (does not clobber)", () => {
  const dir = mkTmpProject("perm-badjson");
  try {
    fs.mkdirSync(path.join(dir, ".claude"), { recursive: true });
    const bad = '{"permissions": ';
    fs.writeFileSync(path.join(dir, ".claude", "settings.json"), bad);
    const r = reg.addPermissionEntry(dir, "psql x");
    assert.equal(r.added, false);
    assert.match(r.reason, /invalid JSON/i);
    // untouched
    assert.equal(fs.readFileSync(path.join(dir, ".claude", "settings.json"), "utf8"), bad);
  } finally {
    rmTmp(dir);
  }
});

// ─── AC9: ensureEnvGitignored auto-adds .env when missing ───────────────────

test("AC9: ensureEnvGitignored adds .env when missing, idempotent when present", () => {
  const dir = mkTmpProject("gitignore");
  try {
    fs.writeFileSync(path.join(dir, ".gitignore"), "node_modules\n");
    const r1 = reg.ensureEnvGitignored(dir);
    assert.equal(r1.added, true);
    const gi = fs.readFileSync(path.join(dir, ".gitignore"), "utf8");
    assert.ok(/^\.env$/m.test(gi));

    const r2 = reg.ensureEnvGitignored(dir);
    assert.equal(r2.added, false);
  } finally {
    rmTmp(dir);
  }
});

test("AC9: ensureEnvGitignored recognizes an existing .env* / /.env rule", () => {
  const dir = mkTmpProject("gitignore-existing");
  try {
    fs.writeFileSync(path.join(dir, ".gitignore"), ".env*\n");
    const r = reg.ensureEnvGitignored(dir);
    assert.equal(r.added, false);
  } finally {
    rmTmp(dir);
  }
});

// ─── AC8 (propagation): both new bins ship in PROJECT_BIN_TOOLS ──────────────

test("propagation: gsd-t-doc-marker.cjs + gsd-t-env-registry.cjs are in PROJECT_BIN_TOOLS", () => {
  const gsdt = require(path.join(ROOT, "bin", "gsd-t.js"));
  assert.ok(Array.isArray(gsdt.PROJECT_BIN_TOOLS));
  assert.ok(gsdt.PROJECT_BIN_TOOLS.includes("gsd-t-doc-marker.cjs"), "doc-marker must ship to projects");
  assert.ok(gsdt.PROJECT_BIN_TOOLS.includes("gsd-t-env-registry.cjs"), "env-registry must ship to projects");
  assert.ok(gsdt.PROJECT_BIN_TOOLS.includes("gsd-t-env-registry-check.cjs"), "env-registry-check must ship to projects");
});

// ─── Verify-gate lint: no-secret + rule-without-table ───────────────────────

test("verify lint: clean registry PASSES", () => {
  const dir = mkTmpProject("lint-clean");
  try {
    reg.recordEnvironment({
      projectDir: dir,
      scope: "prod",
      kind: "postgres",
      host: "h",
      secretVault: "Neon",
      secretEnvVarName: "DATABASE_URL_PROD",
      connectCommand: 'psql "$DATABASE_URL_PROD"',
    });
    const r = envCheck(dir);
    assert.equal(r.ok, true, JSON.stringify(r.failures));
  } finally {
    rmTmp(dir);
  }
});

test("verify lint: FAILS when a row cell holds a secret-shaped literal", () => {
  const dir = mkTmpProject("lint-secret");
  try {
    // hand-inject a poisoned row bypassing recordEnvironment's guard.
    const p = path.join(dir, "docs", "infrastructure.md");
    let content = infra(dir);
    const poisoned =
      "| prod-postgres | prod | postgres | h | 5432 | db | password | local (.env) | DATABASE_URL_PROD | — | psql \"postgres://admin:hunter2SuperSecret@h:5432/db\" | none | YES | 2026-07-13 |";
    content = content.replace(
      reg.ENV_MARKER_END,
      poisoned + "\n" + reg.ENV_MARKER_END
    );
    fs.writeFileSync(p, content, "utf8");
    const r = envCheck(dir);
    assert.equal(r.ok, false);
    assert.ok(r.failures.some((f) => /secret-shaped/.test(f)));
  } finally {
    rmTmp(dir);
  }
});

test("verify lint: FAILS when the env-access rule is present but the table markers are absent", () => {
  const dir = mkTmpProject("lint-rule-notable");
  try {
    // infra doc WITHOUT the markers
    fs.writeFileSync(path.join(dir, "docs", "infrastructure.md"), "# Infra\n");
    fs.writeFileSync(
      path.join(dir, "CLAUDE.md"),
      "### Environment Access — read-first, HALT-and-document (M102)\n"
    );
    const r = envCheck(dir);
    assert.equal(r.ok, false);
    assert.ok(r.failures.some((f) => /markers are absent/.test(f)));
  } finally {
    rmTmp(dir);
  }
});

test("verify lint: no-op PASS when project has neither table nor rule", () => {
  const dir = mkTmpProject("lint-noop");
  try {
    fs.writeFileSync(path.join(dir, "docs", "infrastructure.md"), "# Infra\n");
    // no CLAUDE.md rule
    const r = envCheck(dir);
    assert.equal(r.ok, true);
    assert.match(r.note, /no-op PASS/);
  } finally {
    rmTmp(dir);
  }
});

// ─── RED TEAM CRITICAL: bare-secret-in-any-field must THROW ───────────────────
//
// The core invariant: NO secret VALUE ever reaches the committed doc. The old
// guard was a DENYLIST (connstring + ~8 allowlisted keys) — a bare token in any
// other field slipped through. These assert the allowlist-per-column inversion:
// each secret shape, in each field, is REJECTED.

const RED_TEAM_SECRETS = {
  "github-PAT": S("ghp", "_1234567890abcdefghijklmnopqrstuvwxyz"),
  "aws-access-key": S("AKIA", "IOSFODNN7EXAMPLE"),
  jwt: S("eyJ", "hbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N"),
  "stripe-live": S("sk", "_live_abcdefghijklmnop1234567890"),
  base64blob: "dGhpc2lzYXZlcnlsb25nYmFzZTY0c2VjcmV0dmFsdWU=",
  "hex-32": "0123456789abcdef0123456789abcdef00",
};

// Fields that take a secret-shaped value directly (host/name/authMethod/vault/
// env-var-name/gotchas/commands). scope+kind+port have their own strict shape.
const RED_TEAM_FIELDS = [
  "host",
  "name",
  "authMethod",
  "secretVault",
  "secretEnvVarName",
  "gotchas",
  "connectCommand",
  "fetchCommand",
];

for (const [secretName, secretVal] of Object.entries(RED_TEAM_SECRETS)) {
  for (const field of RED_TEAM_FIELDS) {
    test(`RED TEAM: bare ${secretName} in "${field}" → recordEnvironment THROWS`, () => {
      const dir = mkTmpProject("rt-throw");
      try {
        const opts = {
          projectDir: dir,
          scope: "prod",
          kind: "postgres",
        };
        opts[field] = secretVal;
        assert.throws(
          () => reg.recordEnvironment(opts),
          (e) => e instanceof Error,
          `bare ${secretName} in ${field} must be rejected`
        );
        // and NOTHING is written to the doc
        assert.ok(
          !infra(dir).includes(secretVal),
          `the ${secretName} value must never reach the doc`
        );
      } finally {
        rmTmp(dir);
      }
    });
  }
}

test("RED TEAM: ldap://user:pw@ embedded credential in a command → THROWS", () => {
  const dir = mkTmpProject("rt-ldap");
  try {
    assert.throws(
      () =>
        reg.recordEnvironment({
          projectDir: dir,
          scope: "prod",
          kind: "ssh-host",
          host: "h",
          connectCommand: "ldapsearch ldap://admin:hunter2@dir.example.com",
        }),
      /inline literal secret/i
    );
  } finally {
    rmTmp(dir);
  }
});

// ─── RED TEAM HIGH-1: the gate uses an INDEPENDENT stricter detector ──────────
//
// A value that somehow evaded the writer (or a hand-edited doc) must still trip
// the gate. Construct the leaked doc DIRECTLY and run the gate.

for (const [secretName, secretVal] of Object.entries(RED_TEAM_SECRETS)) {
  test(`RED TEAM HIGH-1: gate FAILs on a hand-crafted doc leaking ${secretName}`, () => {
    const dir = mkTmpProject("rt-gate");
    try {
      const p = path.join(dir, "docs", "infrastructure.md");
      let content = infra(dir);
      // inject the secret into the db/name cell — a value NEVER written through
      // recordEnvironment (proves the gate is independent of the writer path).
      const poisoned =
        `| prod-postgres | prod | postgres | h | 5432 | ${secretVal} | password | Neon | ` +
        `DATABASE_URL_PROD | neonctl | psql "$X" | none | YES | 2026-07-13 |`;
      content = content.replace(reg.ENV_MARKER_END, poisoned + "\n" + reg.ENV_MARKER_END);
      fs.writeFileSync(p, content, "utf8");
      const r = envCheck(dir);
      assert.equal(r.ok, false, `gate must FAIL on leaked ${secretName}`);
      assert.ok(r.failures.some((f) => /secret-shaped/.test(f)));
    } finally {
      rmTmp(dir);
    }
  });
}

test("RED TEAM HIGH-1: writer and gate are NOT the same check — gate imports looksLikeSecretValue, not the writer's allowlist", () => {
  const checkSrc = fs.readFileSync(
    path.join(ROOT, "bin", "gsd-t-env-registry-check.cjs"),
    "utf8"
  );
  // the gate runs the entropy/prefix detector over every cell, plus its OWN
  // embedded-credential regex — it does NOT call the writer's per-column
  // allowlist validators (recordEnvironment / validateRow).
  assert.ok(/looksLikeSecretValue/.test(checkSrc), "gate must keep the prefix detector as a backstop");
  assert.ok(/GATE_EMBEDDED_CRED/.test(checkSrc), "gate must carry its own embedded-cred detector");
  assert.ok(!/validateRow|recordEnvironment/.test(checkSrc), "gate must not delegate to the writer's row validation");
  // PRIMARY guard is the gate's OWN re-implemented positive per-column shapes.
  assert.ok(/cellMatchesColumnShape/.test(checkSrc), "gate must apply its own positive per-column shape check");
});

// ─── RED TEAM MEDIUM-1: deriveTool rejects shell-metacharacter tokens ─────────

test("RED TEAM MEDIUM-1: deriveTool returns null for a shell-metachar tool token; addPermissionEntry writes nothing", () => {
  const dir = mkTmpProject("rt-metachar");
  try {
    for (const bad of ["psql;rm", "psql|cat", "psql&", "$(whoami)", "psql`id`", "psql>out"]) {
      assert.equal(reg.deriveTool(bad), null, `"${bad}" must not derive a tool`);
    }
    const r = reg.addPermissionEntry(dir, "psql;rm -rf /");
    assert.equal(r.added, false);
    assert.equal(r.tool, null);
    // no settings.json written
    assert.ok(!fs.existsSync(path.join(dir, ".claude", "settings.json")));
    // a clean tool still derives
    assert.equal(reg.deriveTool("psql -h h"), "psql");
  } finally {
    rmTmp(dir);
  }
});

// ─── RED TEAM MEDIUM-2: ensureEnvGitignored protects .env.* variants ──────────

test("RED TEAM MEDIUM-2: ensureEnvGitignored protects .env.production when present", () => {
  const dir = mkTmpProject("rt-envprod");
  try {
    fs.writeFileSync(path.join(dir, ".env.production"), "SECRET=live\n");
    fs.writeFileSync(path.join(dir, ".env.local"), "SECRET=dev\n");
    fs.writeFileSync(path.join(dir, ".gitignore"), "node_modules\n");
    const r = reg.ensureEnvGitignored(dir);
    assert.equal(r.added, true);
    const gi = fs.readFileSync(path.join(dir, ".gitignore"), "utf8");
    // a broad `.env*` rule (covers .env.production + .env.local + .env)
    assert.ok(/^\.env\*$/m.test(gi), "must add a broad .env* rule covering all variants");
  } finally {
    rmTmp(dir);
  }
});

test("RED TEAM MEDIUM-2: a bare `.env` rule does NOT satisfy a present .env.production", () => {
  const dir = mkTmpProject("rt-envprod-bare");
  try {
    fs.writeFileSync(path.join(dir, ".env.production"), "SECRET=live\n");
    fs.writeFileSync(path.join(dir, ".gitignore"), ".env\n");
    const r = reg.ensureEnvGitignored(dir);
    assert.equal(r.added, true, ".env.production must be added even though .env is already ignored");
    const gi = fs.readFileSync(path.join(dir, ".gitignore"), "utf8");
    assert.ok(/\.env\.production|\.env\*/.test(gi));
  } finally {
    rmTmp(dir);
  }
});

// ─── RED TEAM MEDIUM-3: marker-smuggling rejected ─────────────────────────────

test("RED TEAM MEDIUM-3: a cell containing the env-registry end marker is REJECTED", () => {
  const dir = mkTmpProject("rt-marker");
  try {
    assert.throws(
      () =>
        reg.recordEnvironment({
          projectDir: dir,
          scope: "prod",
          kind: "postgres",
          host: "h",
          gotchas: `oops ${reg.ENV_MARKER_END} injected`,
        }),
      /reserved doc-marker substring/i
    );
    assert.ok(!/oops/.test(infra(dir)), "nothing smuggled must be written");
  } finally {
    rmTmp(dir);
  }
});

test("RED TEAM MEDIUM-3: a cell containing the logging-scaffold marker is REJECTED", () => {
  const dir = mkTmpProject("rt-marker2");
  try {
    assert.throws(
      () =>
        reg.recordEnvironment({
          projectDir: dir,
          scope: "prod",
          kind: "postgres",
          host: "h",
          gotchas: "x <!-- gsd-t-logging-scaffold:start --> y",
        }),
      /reserved doc-marker substring/i
    );
  } finally {
    rmTmp(dir);
  }
});

// ─── RED TEAM MEDIUM-4: readOnlyDefault coercion ──────────────────────────────

test("RED TEAM MEDIUM-4: readOnlyDefault coerces non-string/boolean → YES/NO strings", () => {
  const dir = mkTmpProject("rt-readonly");
  try {
    const bool = reg.recordEnvironment({
      projectDir: dir,
      scope: "local",
      kind: "postgres",
      host: "localhost",
      readOnlyDefault: false,
    });
    assert.equal(bool["read-only default"], "NO");
    assert.notEqual(bool["read-only default"], "false");

    const boolT = reg.recordEnvironment({
      projectDir: dir,
      scope: "local",
      kind: "redis",
      host: "localhost",
      readOnlyDefault: true,
    });
    assert.equal(boolT["read-only default"], "YES");

    const num = reg.recordEnvironment({
      projectDir: dir,
      scope: "local",
      kind: "mysql",
      host: "localhost",
      readOnlyDefault: 0,
    });
    assert.equal(num["read-only default"], "NO");
    // never a literal "false"/"0" in the doc's read-only column
    assert.ok(!/\| false \|/.test(infra(dir)));
  } finally {
    rmTmp(dir);
  }
});

// ─── RED TEAM LOW-1: host-change-on-upsert warning surfaced ───────────────────

test("RED TEAM LOW-1: upsert of a DIFFERENT host on the same (scope,kind) surfaces a warning", () => {
  const dir = mkTmpProject("rt-hostchange");
  try {
    const first = reg.recordEnvironment({
      projectDir: dir,
      scope: "prod",
      kind: "postgres",
      host: "old.aivencloud.com",
      secretVault: "local (.env)",
      secretEnvVarName: "DATABASE_URL_PROD",
      connectCommand: 'psql "$DATABASE_URL_PROD"',
    });
    assert.equal(first.replaced, false);
    assert.ok(!first.warnedHostChange);

    const second = reg.recordEnvironment({
      projectDir: dir,
      scope: "prod",
      kind: "postgres",
      host: "ep-neon.neon.tech",
      secretVault: "Neon",
      secretEnvVarName: "DATABASE_URL_PROD",
      connectCommand: 'psql "$DATABASE_URL_PROD"',
    });
    assert.equal(second.replaced, true);
    assert.equal(second.warnedHostChange, true);
    assert.equal(second.oldHost, "old.aivencloud.com");
    assert.equal(second.newHost, "ep-neon.neon.tech");

    // same host again → no host-change warning
    const third = reg.recordEnvironment({
      projectDir: dir,
      scope: "prod",
      kind: "postgres",
      host: "ep-neon.neon.tech",
      secretVault: "Neon",
      secretEnvVarName: "DATABASE_URL_PROD",
      connectCommand: 'psql "$DATABASE_URL_PROD"',
    });
    assert.equal(third.replaced, true);
    assert.ok(!third.warnedHostChange, "same host must NOT warn");
  } finally {
    rmTmp(dir);
  }
});

// ─── No false positives on legitimate map values ─────────────────────────────

test("legit map values pass — hostname, identifier db name, enumerated vault, UPPER_SNAKE env var", () => {
  const dir = mkTmpProject("legit");
  try {
    const row = reg.recordEnvironment({
      projectDir: dir,
      scope: "prod",
      kind: "postgres",
      host: "ep-cool-name-123.us-east-2.aws.neon.tech",
      port: "5432",
      name: "neondb_prod",
      authMethod: "password",
      secretVault: "Neon",
      secretEnvVarName: "DATABASE_URL_PROD",
      fetchCommand: "neonctl connection-string",
      connectCommand: 'psql "$DATABASE_URL_PROD"',
      gotchas: "vpn, ip-allowlist",
    });
    assert.equal(row.scope, "prod");
    assert.equal(envCheck(dir).ok, true, "legit row must pass the gate");
  } finally {
    rmTmp(dir);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// M102 STRUCTURAL FIX (post-2nd-Red-Team) — entropy thresholds CANNOT guard the
// free-text/command columns. The DB-password `Xk9#mPq2vLzR8nQw` (no known
// prefix, below base64/hex length) leaked. These regressions prove the
// STRUCTURAL guard (command allowlist + enumerated gotchas + gate blob scan).
// ═══════════════════════════════════════════════════════════════════════════

// The money-shot: a real 16-char DB password with no prefix, below the
// base64/hex thresholds. It carries a `#`, but even a no-symbol variant must go.
const DB_PASSWORD = "Xk9#mPq2vLzR8nQw";

for (const field of ["gotchas", "connectCommand", "fetchCommand"]) {
  test(`STRUCTURAL: DB-password ${DB_PASSWORD} in "${field}" → recordEnvironment THROWS`, () => {
    const dir = mkTmpProject("struct-dbpw");
    try {
      const opts = { projectDir: dir, scope: "prod", kind: "postgres", host: "h" };
      if (field === "connectCommand") opts.connectCommand = `psql -U admin -W ${DB_PASSWORD}`;
      else if (field === "fetchCommand") opts.fetchCommand = `echo ${DB_PASSWORD}`;
      else opts.gotchas = DB_PASSWORD;
      assert.throws(() => reg.recordEnvironment(opts), (e) => e instanceof Error);
      assert.ok(!infra(dir).includes(DB_PASSWORD), "DB password must never reach the doc");
    } finally {
      rmTmp(dir);
    }
  });
}

// A password with NO special chars (upper+lower+digit, ≥12) must ALSO reject —
// it is a mixed-entropy blob even without a symbol.
test("STRUCTURAL: a no-symbol mixed-entropy password (Xk9mPq2vLzR8nQwABCDEF) in a command → THROWS", () => {
  const dir = mkTmpProject("struct-nosym");
  try {
    assert.throws(
      () =>
        reg.recordEnvironment({
          projectDir: dir,
          scope: "prod",
          kind: "postgres",
          host: "h",
          connectCommand: "psql -U admin -W Xk9mPq2vLzR8nQwABCDEF",
        }),
      (e) => e instanceof Error
    );
  } finally {
    rmTmp(dir);
  }
});

// The gate must FAIL independently on the DB password hand-injected into ANY
// cell — never written through recordEnvironment (proves the gate is stricter
// than the writer's prefix/base64/hex detector, which misses this class).
test("STRUCTURAL: gate FAILs on hand-crafted doc leaking the DB-password (independent of writer)", () => {
  const dir = mkTmpProject("struct-gate");
  try {
    const p = path.join(dir, "docs", "infrastructure.md");
    let content = infra(dir);
    const poisoned =
      `| prod-postgres | prod | postgres | h | 5432 | ${DB_PASSWORD} | password | Neon | ` +
      `DATABASE_URL_PROD | neonctl | psql "$X" | none | YES | 2026-07-13 |`;
    content = content.replace(reg.ENV_MARKER_END, poisoned + "\n" + reg.ENV_MARKER_END);
    fs.writeFileSync(p, content, "utf8");
    const r = envCheck(dir);
    assert.equal(r.ok, false, "gate must FAIL on the leaked DB password");
    assert.ok(r.failures.some((f) => /secret-shaped/.test(f)));
  } finally {
    rmTmp(dir);
  }
});

// The gate does NOT merely re-call the writer's recordEnvironment/validateRow —
// it carries its OWN independent POSITIVE per-column shape implementation
// (gateIsHostShape / gateIsDbNameShape / gateCommandOk / gateGotchasOk).
test("STRUCTURAL: gate source is independent — no recordEnvironment/validateRow call, own positive shapes", () => {
  const checkSrc = fs.readFileSync(
    path.join(ROOT, "bin", "gsd-t-env-registry-check.cjs"),
    "utf8"
  );
  assert.ok(!/validateRow|recordEnvironment/.test(checkSrc), "gate must not delegate to writer row validation");
  assert.ok(/gateIsHostShape/.test(checkSrc), "gate must implement its own positive host shape");
  assert.ok(/gateIsDbNameShape/.test(checkSrc), "gate must implement its own positive db-name shape");
  assert.ok(/gateCommandOk/.test(checkSrc), "gate must implement its own positive command allowlist");
  assert.ok(/cellMatchesColumnShape/.test(checkSrc), "gate must map cells to positive per-column shapes");
});

// Every Red Team leak — THROWS at write AND FAILs at gate, in every free/command
// column. (UUID + platform tokens + a bare 23-char mixed-entropy blob.)
const RED_TEAM_STRUCTURAL_LEAKS = {
  uuid: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
  "slack-app": "xapp-1-A0123-456-abcdef",
  sendgrid: S("SG", ".aB3xK9mPq2vLzR8nQ.0uVwXyZ1234567"),
  digitalocean: S("dop", "_v1_1a2b3c4d5e6f7a8b9c0d"),
  gitlab: S("glpat", "-aB3xK9mPq2vLzR8nQ0u"),
  "bare-23char": "aB3xK9mPq2vLzR8nQ0uVwXy",
};

for (const [name, val] of Object.entries(RED_TEAM_STRUCTURAL_LEAKS)) {
  test(`STRUCTURAL RED TEAM: ${name} (${val}) → THROWS at write (gotchas/connect/fetch)`, () => {
    for (const field of ["gotchas", "connectCommand", "fetchCommand"]) {
      const dir = mkTmpProject("struct-rt-write");
      try {
        const opts = { projectDir: dir, scope: "prod", kind: "postgres", host: "h" };
        if (field === "connectCommand") opts.connectCommand = `psql ${val}`;
        else if (field === "fetchCommand") opts.fetchCommand = `echo ${val}`;
        else opts.gotchas = val;
        assert.throws(
          () => reg.recordEnvironment(opts),
          (e) => e instanceof Error,
          `${name} in ${field} must throw`
        );
        assert.ok(!infra(dir).includes(val), `${name} must never reach the doc via ${field}`);
      } finally {
        rmTmp(dir);
      }
    }
  });

  test(`STRUCTURAL RED TEAM: ${name} (${val}) → gate FAILs when hand-injected`, () => {
    const dir = mkTmpProject("struct-rt-gate");
    try {
      const p = path.join(dir, "docs", "infrastructure.md");
      let content = infra(dir);
      const poisoned =
        `| prod-postgres | prod | postgres | h | 5432 | ${val} | password | Neon | ` +
        `DATABASE_URL_PROD | neonctl | psql "$X" | none | YES | 2026-07-13 |`;
      content = content.replace(reg.ENV_MARKER_END, poisoned + "\n" + reg.ENV_MARKER_END);
      fs.writeFileSync(p, content, "utf8");
      const r = envCheck(dir);
      assert.equal(r.ok, false, `gate must FAIL on leaked ${name}`);
    } finally {
      rmTmp(dir);
    }
  });
}

// ─── NO FALSE POSITIVES on the legit-input list (must all RECORD + PASS) ──────

const LEGIT_CONNECT_COMMANDS = [
  'psql "$DATABASE_URL_PROD"',
  "neonctl connection-string",
  "vercel env pull",
  "gcloud secrets versions access $SECRET --secret=db-url",
  "psql -h ep-cool.us-east-2.aws.neon.tech -U binvoice -d binvoice_prod",
];

for (const cmd of LEGIT_CONNECT_COMMANDS) {
  test(`STRUCTURAL no-false-positive: legit command records cleanly — ${cmd}`, () => {
    const dir = mkTmpProject("struct-legit-cmd");
    try {
      const row = reg.recordEnvironment({
        projectDir: dir,
        scope: "prod",
        kind: "postgres",
        host: "ep-cool.us-east-2.aws.neon.tech",
        secretVault: "Neon",
        secretEnvVarName: "DATABASE_URL_PROD",
        connectCommand: cmd,
      });
      assert.equal(row.scope, "prod");
      assert.equal(envCheck(dir).ok, true, `gate must PASS the legit command: ${cmd}`);
    } finally {
      rmTmp(dir);
    }
  });
}

const LEGIT_GOTCHAS = ["vpn", "ip-allowlist", "ssh-tunnel via bastion.example.com", "none"];

for (const g of LEGIT_GOTCHAS) {
  test(`STRUCTURAL no-false-positive: legit enumerated gotchas passes — "${g}"`, () => {
    const dir = mkTmpProject("struct-legit-gotcha");
    try {
      const row = reg.recordEnvironment({
        projectDir: dir,
        scope: "prod",
        kind: "postgres",
        host: "h",
        secretVault: "Neon",
        secretEnvVarName: "DATABASE_URL_PROD",
        connectCommand: 'psql "$DATABASE_URL_PROD"',
        gotchas: g,
      });
      assert.equal(row.scope, "prod");
      assert.equal(envCheck(dir).ok, true, `gate must PASS legit gotchas: ${g}`);
    } finally {
      rmTmp(dir);
    }
  });
}

// The exact GCP fetch command with a --secret=identifier flag value must pass.
test("STRUCTURAL no-false-positive: gcloud fetch with $VAR + --secret=identifier passes", () => {
  const dir = mkTmpProject("struct-gcp");
  try {
    const row = reg.recordEnvironment({
      projectDir: dir,
      scope: "prod",
      kind: "postgres",
      host: "h",
      secretVault: "Google Secret Manager",
      secretEnvVarName: "DATABASE_URL_PROD",
      fetchCommand: "gcloud secrets versions access $SECRET --secret=db-url",
      connectCommand: 'psql "$DATABASE_URL_PROD"',
    });
    assert.equal(row.scope, "prod");
    assert.equal(envCheck(dir).ok, true);
  } finally {
    rmTmp(dir);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// POSITIVE-ALLOWLIST FIX (post-3rd-Red-Team) — the leaky columns (host / name /
// authMethod / command bare-arg / command flag-value) now use a TIGHT POSITIVE
// ALLOWLIST (real hostname / enum / $VAR / curated word), NOT an entropy floor.
// THREE Red Team passes each leaked a secret under whatever floor was in place;
// the floor is GONE as the primary guard. Every value below is rejected because
// it is NOT the positive shape its column holds — with ZERO entropy check.
// ═══════════════════════════════════════════════════════════════════════════

// The full 3rd-Red-Team leak set. Every one must THROW at the writer in each
// accepting column AND FAIL at the gate when hand-injected.
const POSITIVE_ALLOWLIST_LEAKS = [
  "hunter2hunter2hunter",
  "8675309867530986753098",
  "Tr0ub4dor",
  "correcthorsebattery",
  "correcthorsebatterystaple",
  "Xk9#mPq2vLzR8nQw",
  "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
  "xapp-1-A0123-456-abcdef",
  S("SG", ".aB3xK9mPq2vLzR8nQ.0uVwXyZ1234567"),
  S("dop", "_v1_1a2b3c4d5e6f7a8b9c0d"),
  S("glpat", "-aB3xK9mPq2vLzR8nQ0u"),
  "aB3xK9mPq2vLzR8nQ0uVwXy",
];

// Every accepting column: host, name, authMethod, connectCommand bare-arg,
// connectCommand flag-value, fetchCommand.
const POSITIVE_ALLOWLIST_FIELDS = [
  "host",
  "name",
  "authMethod",
  "connectCommand", // bare-arg form: `psql <leak>`
  "connectCommandFlagValue", // flag-value form: `psql --password=<leak>`
  "fetchCommand",
];

for (const leak of POSITIVE_ALLOWLIST_LEAKS) {
  test(`POSITIVE-ALLOWLIST: "${leak}" THROWS at writer in every accepting column`, () => {
    for (const field of POSITIVE_ALLOWLIST_FIELDS) {
      const dir = mkTmpProject("pa-write");
      try {
        const opts = { projectDir: dir, scope: "prod", kind: "postgres", host: "h" };
        if (field === "connectCommand") opts.connectCommand = `psql ${leak}`;
        else if (field === "connectCommandFlagValue") opts.connectCommand = `psql --password=${leak}`;
        else if (field === "fetchCommand") opts.fetchCommand = `echo ${leak}`;
        else opts[field] = leak;
        assert.throws(
          () => reg.recordEnvironment(opts),
          (e) => e instanceof Error,
          `"${leak}" in ${field} must throw`
        );
        assert.ok(
          !infra(dir).includes(leak),
          `"${leak}" must never reach the doc via ${field}`
        );
      } finally {
        rmTmp(dir);
      }
    }
  });

  test(`POSITIVE-ALLOWLIST: gate FAILs on a hand-crafted doc leaking "${leak}"`, () => {
    // inject into a spread of columns (db/name, host, auth method, connect cmd).
    for (const colIdx of [3 /*host*/, 5 /*db/name*/, 6 /*auth*/, 10 /*connect*/]) {
      const dir = mkTmpProject("pa-gate");
      try {
        const p = path.join(dir, "docs", "infrastructure.md");
        let content = infra(dir);
        const cells = [
          "prod-postgres", "prod", "postgres", "h", "5432", "db", "password",
          "Neon", "DATABASE_URL_PROD", "neonctl", 'psql "$X"', "none", "YES",
          "2026-07-13",
        ];
        cells[colIdx] = leak;
        const poisoned = "| " + cells.join(" | ") + " |";
        content = content.replace(reg.ENV_MARKER_END, poisoned + "\n" + reg.ENV_MARKER_END);
        fs.writeFileSync(p, content, "utf8");
        const r = envCheck(dir);
        assert.equal(r.ok, false, `gate must FAIL on "${leak}" in column ${colIdx}`);
        assert.ok(r.failures.some((f) => /secret-shaped/.test(f)));
      } finally {
        rmTmp(dir);
      }
    }
  });
}

// The two command-form leak cases called out explicitly in the fix brief.
test("POSITIVE-ALLOWLIST: `--password=correcthorsebattery` flag value THROWS", () => {
  const dir = mkTmpProject("pa-flagpw");
  try {
    assert.throws(
      () =>
        reg.recordEnvironment({
          projectDir: dir,
          scope: "prod",
          kind: "postgres",
          host: "h",
          connectCommand: "psql --password=correcthorsebattery",
        }),
      (e) => e instanceof Error
    );
    assert.ok(!infra(dir).includes("correcthorsebattery"));
  } finally {
    rmTmp(dir);
  }
});

test("POSITIVE-ALLOWLIST: `psql hunter2hunter2hunter` bare-arg THROWS", () => {
  const dir = mkTmpProject("pa-barearg");
  try {
    assert.throws(
      () =>
        reg.recordEnvironment({
          projectDir: dir,
          scope: "prod",
          kind: "postgres",
          host: "h",
          connectCommand: "psql hunter2hunter2hunter",
        }),
      (e) => e instanceof Error
    );
    assert.ok(!infra(dir).includes("hunter2hunter2hunter"));
  } finally {
    rmTmp(dir);
  }
});

// The positive shapes accept every legit input (no false-positive regressions).
test("POSITIVE-ALLOWLIST no-false-positive: all legit hosts / auth / db-names record + gate PASS", () => {
  const cases = [
    { field: "host", val: "localhost" },
    { field: "host", val: "127.0.0.1" },
    { field: "host", val: "db" },
    { field: "host", val: "postgres" },
    { field: "host", val: "db-primary" },
    { field: "host", val: "ep-cool.us-east-2.aws.neon.tech" },
    { field: "authMethod", val: "password" },
    { field: "authMethod", val: "iam" },
    { field: "authMethod", val: "service-account" },
    { field: "authMethod", val: "none" },
    { field: "name", val: "binvoice_prod" },
    { field: "name", val: "analytics" },
  ];
  for (const { field, val } of cases) {
    const dir = mkTmpProject("pa-legit");
    try {
      const opts = {
        projectDir: dir,
        scope: "prod",
        kind: "postgres",
        host: "h",
        secretVault: "Neon",
        secretEnvVarName: "DATABASE_URL_PROD",
        connectCommand: 'psql "$DATABASE_URL_PROD"',
      };
      opts[field] = val;
      const row = reg.recordEnvironment(opts);
      assert.equal(row.scope, "prod");
      assert.equal(envCheck(dir).ok, true, `legit ${field}=${val} must pass the gate`);
    } finally {
      rmTmp(dir);
    }
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// CYCLE-5 RED TEAM LEAKS (2026-07-16) — the command column was still free-form.
// A short lowercase string is simultaneously a valid host-label AND a valid
// weak/random password, so THREE realistic credential syntaxes leaked through
// `connect command` / `fetch command`, plus a gate overflow-column hole.
// Fix = STRUCTURAL command-grammar tightening (NOT a value check):
//   #1 glued short flag `-pS3cret…` is split → value forced to $VAR
//   #2 secret-bearing flag `--password=X` value MUST be $VAR (host-shape ≠ ok)
//   #3 a cell beyond the fixed 14-column schema is a HARD gate FAIL
// Every payload below must THROW at the writer AND FAIL at the gate.
// ═══════════════════════════════════════════════════════════════════════════

// Leak #1 — glued short-flag credentials (mysql -p<pw>, psql -W<pw>).
const CYCLE5_GLUED_FLAG_LEAKS = [
  "mysql -uroot -pS3cretDbPass2024 appdb",
  "mysql -pMyDbPass2024",
  "psql -Wswordfish",
  "psql -Wchangeme",
  "mysql -pTr0ubador",
];

// Leak #2 — secret-bearing --flag=value where the value is host/db-name shaped.
const CYCLE5_FLAG_VALUE_LEAKS = [
  "psql --password=swordfish",
  "psql --password=changeme",
  "psql --password=qzfwmxkbvnrjhlpd", // random all-lowercase ≤16 — high-entropy, host-shaped
  "redis-cli --pass=secret",
  "psql --passwd=letmein",
];

for (const cmd of [...CYCLE5_GLUED_FLAG_LEAKS, ...CYCLE5_FLAG_VALUE_LEAKS]) {
  test(`CYCLE5: command leak THROWS at writer — "${cmd}"`, () => {
    for (const field of ["connectCommand", "fetchCommand"]) {
      const dir = mkTmpProject("c5-write");
      try {
        const opts = { projectDir: dir, scope: "prod", kind: "postgres", host: "h" };
        opts[field] = cmd;
        assert.throws(
          () => reg.recordEnvironment(opts),
          (e) => e instanceof Error,
          `"${cmd}" in ${field} must throw`
        );
        // the whole leaking command must never reach the doc (checking the full
        // command, not a bare common word like "secret" that legitimately
        // appears in the doctrine prose).
        assert.ok(!infra(dir).includes(cmd), `"${cmd}" must never reach the doc`);
      } finally {
        rmTmp(dir);
      }
    }
  });

  test(`CYCLE5: command leak FAILs at gate (hand-edited doc) — "${cmd}"`, () => {
    const dir = mkTmpProject("c5-gate");
    try {
      const p = path.join(dir, "docs", "infrastructure.md");
      let content = infra(dir);
      const cells = [
        "prod-postgres", "prod", "postgres", "h", "5432", "db", "password",
        "Neon", "DATABASE_URL_PROD", "neonctl", cmd, "none", "YES", "2026-07-16",
      ];
      const poisoned = "| " + cells.join(" | ") + " |";
      content = content.replace(reg.ENV_MARKER_END, poisoned + "\n" + reg.ENV_MARKER_END);
      fs.writeFileSync(p, content, "utf8");
      const r = envCheck(dir);
      assert.equal(r.ok, false, `gate must FAIL on hand-edited "${cmd}"`);
    } finally {
      rmTmp(dir);
    }
  });
}

// Leak #1/#2 corollaries in `access gotchas` (`via <short-password>`).
for (const g of ["ssh-tunnel via swordfish", "ssh-tunnel via changeme"]) {
  // NOTE: `via <host>` accepts a short lowercase label as a bastion NAME — this
  // is the SAME host-label/password collision. It is accepted BY DESIGN as a
  // bastion identifier (a bastion named `swordfish` is legal); a real secret in
  // a gotcha is out of scope for the gotcha column (enumerated + host-label
  // only, no free literal). Documented here so a future Red Team knows it was
  // considered, not missed. If deemed a leak, tighten `via` to dotted-DNS/IPv4.
  test(`CYCLE5 (documented-accept): gotcha "${g}" records as a bastion identifier`, () => {
    const dir = mkTmpProject("c5-gotcha");
    try {
      const row = reg.recordEnvironment({
        projectDir: dir, scope: "prod", kind: "postgres", host: "h",
        secretVault: "Neon", secretEnvVarName: "DATABASE_URL_PROD",
        connectCommand: 'psql "$DATABASE_URL_PROD"', gotchas: g,
      });
      assert.equal(row.scope, "prod");
    } finally {
      rmTmp(dir);
    }
  });
}

// Leak #3 — a 15th (overflow) cell hides a plaintext secret past the gate.
const CYCLE5_OVERFLOW_SECRETS = ["S3cr3t!Pass", "P@ssw0rd123", "MyDBpw#2024", "hunter2"];
for (const secret of CYCLE5_OVERFLOW_SECRETS) {
  test(`CYCLE5: gate FAILs on an overflow 15th cell hiding "${secret}"`, () => {
    const dir = mkTmpProject("c5-overflow");
    try {
      const p = path.join(dir, "docs", "infrastructure.md");
      let content = infra(dir);
      const cells = [
        "prod-postgres", "prod", "postgres", "h", "5432", "db", "password",
        "Neon", "DATABASE_URL_PROD", "neonctl", 'psql "$X"', "none", "YES",
        "2026-07-16", secret, // 15th cell — beyond the fixed 14-column schema
      ];
      const poisoned = "| " + cells.join(" | ") + " |";
      content = content.replace(reg.ENV_MARKER_END, poisoned + "\n" + reg.ENV_MARKER_END);
      fs.writeFileSync(p, content, "utf8");
      const r = envCheck(dir);
      assert.equal(r.ok, false, `gate must FAIL on overflow cell "${secret}"`);
      assert.ok(r.failures.some((f) => /extra cell beyond/.test(f)));
    } finally {
      rmTmp(dir);
    }
  });
}

// No-false-positive: legit glued & flag-value commands still record + pass.
const CYCLE5_LEGIT_COMMANDS = [
  'mysql -uroot -p"$DB_PASSWORD" -D appdb', // $VAR glued value + -D dbname flag (not a bare positional)
  "psql -h localhost -U postgres -d appdb", // separate non-secret short flags
  'psql -W "$DATABASE_URL"', // bare -W (prompt) + $VAR
  "gcloud secrets versions access latest --secret=db-url", // resource-name flag
  "vercel env pull",
  "neonctl connection-string",
  'psql "$DATABASE_URL_PROD"',
];
for (const cmd of CYCLE5_LEGIT_COMMANDS) {
  test(`CYCLE5 no-false-positive: legit command records + gate PASS — "${cmd}"`, () => {
    const dir = mkTmpProject("c5-legit");
    try {
      const row = reg.recordEnvironment({
        projectDir: dir, scope: "prod", kind: "postgres", host: "localhost",
        secretVault: "Neon", secretEnvVarName: "DATABASE_URL_PROD",
        connectCommand: cmd,
      });
      assert.equal(row.scope, "prod");
      assert.equal(envCheck(dir).ok, true, `legit command must pass the gate: ${cmd}`);
    } finally {
      rmTmp(dir);
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// CYCLE-6 RED TEAM LEAKS (2026-07-16) — the SECRET-flag-name denylist was the
// wrong primitive (open category). Space-separated + unlisted-flag credentials
// walked past it. FIX = invert to a CLOSED SAFE-LABEL ALLOWLIST: a bare
// identifier value is allowed ONLY after --user/--dbname/--host/--port/--secret;
// every OTHER flag's value must be $VAR. Each payload must THROW at the writer
// AND FAIL at the gate.
// ═══════════════════════════════════════════════════════════════════════════

const CYCLE6_COMMAND_LEAKS = [
  // Leak #1 — space-separated secret-bearing flag (the headline miss).
  "psql -h db.example.com -U admin --password swordfish",
  "psql --password swordfish",
  "psql --password changeme",
  "psql --password letmein",
  "mysql -p swordfish",
  "curl --token abcdeftoken",
  // Leak #2 — secret flags NOT on any denylist (--pw / --dbpass / --auth-token).
  "psql --pw=swordfish",
  "psql --dbpass=swordfish",
  "curl --auth-token=swordfish",
  "curl --api-key=swordfish",
  "psql --pw swordfish",
  // Leak #3 — glued short secret flag outside {p,w} (redis -a auth).
  "redis-cli -a secretauth",
  "redis-cli -asecretauth",
  // Leak #4 — connection-string / url flags carrying a bare literal.
  "psql --dsn=swordfish",
  "psql --uri=changeme",
  "psql --url=letmein",
];

for (const cmd of CYCLE6_COMMAND_LEAKS) {
  test(`CYCLE6: command leak THROWS at writer — "${cmd}"`, () => {
    for (const field of ["connectCommand", "fetchCommand"]) {
      const dir = mkTmpProject("c6-write");
      try {
        const opts = { projectDir: dir, scope: "prod", kind: "postgres", host: "h" };
        opts[field] = cmd;
        assert.throws(
          () => reg.recordEnvironment(opts),
          (e) => e instanceof Error,
          `"${cmd}" in ${field} must throw`
        );
        assert.ok(!infra(dir).includes(cmd), `"${cmd}" must never reach the doc`);
      } finally {
        rmTmp(dir);
      }
    }
  });

  test(`CYCLE6: command leak FAILs at gate (hand-edited doc) — "${cmd}"`, () => {
    const dir = mkTmpProject("c6-gate");
    try {
      const p = path.join(dir, "docs", "infrastructure.md");
      let content = infra(dir);
      const cells = [
        "prod-postgres", "prod", "postgres", "h", "5432", "db", "password",
        "Neon", "DATABASE_URL_PROD", "neonctl", cmd, "none", "YES", "2026-07-16",
      ];
      const poisoned = "| " + cells.join(" | ") + " |";
      content = content.replace(reg.ENV_MARKER_END, poisoned + "\n" + reg.ENV_MARKER_END);
      fs.writeFileSync(p, content, "utf8");
      assert.equal(envCheck(dir).ok, false, `gate must FAIL on hand-edited "${cmd}"`);
    } finally {
      rmTmp(dir);
    }
  });
}

// No-false-positive: the SAFE-LABEL allowlist still accepts real username / db /
// host / port args after their proper flags, both spaced and glued.
const CYCLE6_LEGIT_COMMANDS = [
  "psql -h ep-cool.us-east-2.aws.neon.tech -U binvoice -d binvoice_prod",
  "psql -U admin -d appdb -h db.example.com",
  "mysql -u root -D appdb -h 10.0.0.5",
  "mysql -uroot -D appdb", // glued -u<user>
  "psql --user=binvoice --dbname=binvoice_prod --host=db.example.com",
  "psql --port 5432 -U admin",
  "gcloud secrets versions access latest --secret=db-url",
  'psql "$DATABASE_URL_PROD"',
  'mysql -u root -p"$DB_PASSWORD" -D appdb', // password via $VAR
];
for (const cmd of CYCLE6_LEGIT_COMMANDS) {
  test(`CYCLE6 no-false-positive: legit command records + gate PASS — "${cmd}"`, () => {
    const dir = mkTmpProject("c6-legit");
    try {
      const row = reg.recordEnvironment({
        projectDir: dir, scope: "prod", kind: "postgres", host: "localhost",
        secretVault: "Neon", secretEnvVarName: "DATABASE_URL_PROD",
        connectCommand: cmd,
      });
      assert.equal(row.scope, "prod");
      assert.equal(envCheck(dir).ok, true, `legit command must pass the gate: ${cmd}`);
    } finally {
      rmTmp(dir);
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// CYCLE-7 RED TEAM LEAKS (2026-07-16) — the safe-label allowlist regressed to an
// ENTROPY FLOOR: the value slot accepted ANY ≤23-char identifier after
// -U/-h/-d/--port/--secret, so a strong/random token passed, caught only by the
// base64/hex backstop. FIX = TYPE each flag's value to its column's tight shape
// (port=digits, host=host-shape, user/db/secret=db-name shape). A strong/random
// credential FAILS the shape → must be $VAR. A WEAK dictionary-word username
// (`-U swordfish`) still passes (accepted scope: not a recognizable secret).
// Each strong-token payload must THROW at the writer AND FAIL at the gate.
// ═══════════════════════════════════════════════════════════════════════════

const CYCLE7_STRONG_TOKEN_LEAKS = [
  "psql -U aB3xK9mPq2vLzR8nQ0uVwXy",          // 23-char (below base64 floor) after -U
  "psql -U S3cretP4ssw0rd",                    // mixed-case+digit strong pw after -U
  "psql -U Passw0rd123",
  "psql -h aB3xK9mPq2vLzR8nQ0uVwXy",           // strong token in host slot
  "psql -d S3cretDbPass2024xy",                // strong token in db slot
  "gcloud secrets versions access latest --secret=S3cretP4ssw0rd", // real pw in --secret
  "gcloud secrets versions access latest --secret=MyR3alPassw0rd",
  "psql --port swordfish",                     // non-digit in port slot
  "psql --port letmein2024",
  "psql -UaB3xK9mPq2vLzR8nQ0uVwXy",            // glued strong token
  "psql -US3cretP4ssw0rd",
  "psql --user=S3cretP4ssw0rd",                // strong token via --user=
  "psql --dbname=aB3xK9mPq2vLzR8nQ0uVwXy",
];

for (const cmd of CYCLE7_STRONG_TOKEN_LEAKS) {
  test(`CYCLE7: strong-token command leak THROWS at writer — "${cmd}"`, () => {
    for (const field of ["connectCommand", "fetchCommand"]) {
      const dir = mkTmpProject("c7-write");
      try {
        const opts = { projectDir: dir, scope: "prod", kind: "postgres", host: "h" };
        opts[field] = cmd;
        assert.throws(
          () => reg.recordEnvironment(opts),
          (e) => e instanceof Error,
          `"${cmd}" in ${field} must throw`
        );
        assert.ok(!infra(dir).includes(cmd), `"${cmd}" must never reach the doc`);
      } finally {
        rmTmp(dir);
      }
    }
  });

  test(`CYCLE7: strong-token command leak FAILs at gate (hand-edited doc) — "${cmd}"`, () => {
    const dir = mkTmpProject("c7-gate");
    try {
      const p = path.join(dir, "docs", "infrastructure.md");
      let content = infra(dir);
      const cells = [
        "prod-postgres", "prod", "postgres", "h", "5432", "db", "password",
        "Neon", "DATABASE_URL_PROD", "neonctl", cmd, "none", "YES", "2026-07-16",
      ];
      const poisoned = "| " + cells.join(" | ") + " |";
      content = content.replace(reg.ENV_MARKER_END, poisoned + "\n" + reg.ENV_MARKER_END);
      fs.writeFileSync(p, content, "utf8");
      assert.equal(envCheck(dir).ok, false, `gate must FAIL on hand-edited "${cmd}"`);
    } finally {
      rmTmp(dir);
    }
  });
}

// No-false-positive: real usernames/db-names/hosts/ports still pass after their
// typed flags (weak-word usernames included — accepted scope).
const CYCLE7_LEGIT_COMMANDS = [
  "psql -h ep-cool.us-east-2.aws.neon.tech -U binvoice -d binvoice_prod",
  "psql -U admin -d appdb -h db.example.com",
  "psql --port 5432 -U admin",
  "gcloud secrets versions access latest --secret=db-url",
  "psql -U swordfish",           // weak dictionary word in username slot — accepted
  "mysql -u root -D appdb",
  'psql "$DATABASE_URL_PROD"',
];
for (const cmd of CYCLE7_LEGIT_COMMANDS) {
  test(`CYCLE7 no-false-positive: legit command records + gate PASS — "${cmd}"`, () => {
    const dir = mkTmpProject("c7-legit");
    try {
      const row = reg.recordEnvironment({
        projectDir: dir, scope: "prod", kind: "postgres", host: "localhost",
        secretVault: "Neon", secretEnvVarName: "DATABASE_URL_PROD",
        connectCommand: cmd,
      });
      assert.equal(row.scope, "prod");
      assert.equal(envCheck(dir).ok, true, `legit command must pass the gate: ${cmd}`);
    } finally {
      rmTmp(dir);
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// CYCLE-8 RED TEAM LEAK (2026-07-17) — dotted-hostname laundering. The loose
// DOTTED_HOSTNAME accepted uppercase+digit labels, and the backstop's base64/hex
// run test required a CONTIGUOUS run — so a high-entropy token with a dot
// inserted (`kR8mNp2qX7wZ4vT6.aB9cD1eF3gH5jK0lM2n`) passed as a "hostname" AND
// dodged the run test. FIX = a STRICT command hostname (lowercase labels ≤24,
// alpha TLD) for command tokens + a dot-stripping backstop re-test. Each payload
// must THROW at the writer AND FAIL at the gate; real hostnames/URLs still pass.
// ═══════════════════════════════════════════════════════════════════════════

const CYCLE8_DOTTED_TOKEN_LEAKS = [
  "curl kR8mNp2qX7wZ4vT6.aB9cD1eF3gH5jK0lM2n",
  "curl aB3xK9mQ2pW7.zR5nT8vL4jH6c.D1fG0sYbNuMiOe",
  "psql -h kR8mNp2qX7wZ4vT6.aB9cD1eF3gH5jK0lM2n",
  "curl http://kR8mNp2qX7wZ4vT6.aB9cD1eF3gH5jK0lM2n",
  "curl Xk9mPq2vLzR8.nQwAbCdEfGh",
];
for (const cmd of CYCLE8_DOTTED_TOKEN_LEAKS) {
  test(`CYCLE8: dotted-token laundering THROWS at writer — "${cmd}"`, () => {
    for (const field of ["connectCommand", "fetchCommand"]) {
      const dir = mkTmpProject("c8-write");
      try {
        const opts = { projectDir: dir, scope: "prod", kind: "postgres", host: "h" };
        opts[field] = cmd;
        assert.throws(() => reg.recordEnvironment(opts), (e) => e instanceof Error,
          `"${cmd}" in ${field} must throw`);
        assert.ok(!infra(dir).includes(cmd), `"${cmd}" must never reach the doc`);
      } finally { rmTmp(dir); }
    }
  });
  test(`CYCLE8: dotted-token laundering FAILs at gate — "${cmd}"`, () => {
    const dir = mkTmpProject("c8-gate");
    try {
      const p = path.join(dir, "docs", "infrastructure.md");
      let content = infra(dir);
      const cells = ["prod-postgres","prod","postgres","h","5432","db","password",
        "Neon","DATABASE_URL_PROD","neonctl",cmd,"none","YES","2026-07-17"];
      content = content.replace(reg.ENV_MARKER_END, "| " + cells.join(" | ") + " |\n" + reg.ENV_MARKER_END);
      fs.writeFileSync(p, content, "utf8");
      assert.equal(envCheck(dir).ok, false, `gate must FAIL on hand-edited "${cmd}"`);
    } finally { rmTmp(dir); }
  });
}

// No-false-positive: real dotted hostnames + URLs still pass.
const CYCLE8_LEGIT = [
  "psql -h ep-cool.us-east-2.aws.neon.tech -U binvoice -d binvoice_prod",
  "curl api.example.com",
  "psql -h bastion.example.com",
  "curl https://api.stripe.com",
  "curl https://api.example.com/v1/charges",
  "psql -h db.internal.corp",
];
for (const cmd of CYCLE8_LEGIT) {
  test(`CYCLE8 no-false-positive: legit host/url records + gate PASS — "${cmd}"`, () => {
    const dir = mkTmpProject("c8-legit");
    try {
      const row = reg.recordEnvironment({
        projectDir: dir, scope: "prod", kind: "postgres", host: "localhost",
        secretVault: "Neon", secretEnvVarName: "DATABASE_URL_PROD", connectCommand: cmd,
      });
      assert.equal(row.scope, "prod");
      assert.equal(envCheck(dir).ok, true, `legit must pass the gate: ${cmd}`);
    } finally { rmTmp(dir); }
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// PER-PROJECT LOCAL-LITERAL SWITCH (user-locked 2026-07-16). A project may opt
// in via .gsd-t/env-registry-config.json {"allowLocalLiteral":true} to allow a
// LITERAL secret in scope=local rows (testing convenience). staging/prod ALWAYS
// strict; absent/invalid config → strict. A relaxed local write returns a
// one-time warning; the gate exempts opted-in local rows from the leak check
// (but NEVER the overflow/corruption check).
// ═══════════════════════════════════════════════════════════════════════════

function mkProjectWithConfig(prefix, cfg) {
  const dir = mkTmpProject(prefix);
  fs.mkdirSync(path.join(dir, ".gsd-t"), { recursive: true });
  if (cfg !== null) {
    fs.writeFileSync(path.join(dir, ".gsd-t", "env-registry-config.json"), JSON.stringify(cfg), "utf8");
  }
  return dir;
}

test("LOCAL-SWITCH: opted-in local row allows a literal secret + returns warning + gate PASS", () => {
  const dir = mkProjectWithConfig("ls-optin", { allowLocalLiteral: true });
  try {
    const row = reg.recordEnvironment({
      projectDir: dir, scope: "local", kind: "postgres",
      connectCommand: "psql --password Xk9#mPq2vLzR8nQw",
    });
    assert.equal(row.localLiteralWarning, true, "must flag the committed-file warning");
    assert.ok(/git history/.test(row.localLiteralNote));
    assert.equal(envCheck(dir).ok, true, "opted-in local row must pass the gate");
  } finally { rmTmp(dir); }
});

test("LOCAL-SWITCH: prod row stays STRICT even when opted-in — literal REJECTED", () => {
  const dir = mkProjectWithConfig("ls-prod", { allowLocalLiteral: true });
  try {
    assert.throws(
      () => reg.recordEnvironment({
        projectDir: dir, scope: "prod", kind: "postgres",
        connectCommand: "psql --password Xk9#mPq2vLzR8nQw",
      }),
      (e) => e instanceof Error,
      "prod literal must throw even with allowLocalLiteral:true"
    );
  } finally { rmTmp(dir); }
});

test("LOCAL-SWITCH: local literal WITHOUT opt-in is REJECTED (default strict)", () => {
  const dir = mkProjectWithConfig("ls-nooptin", null);
  try {
    assert.throws(
      () => reg.recordEnvironment({
        projectDir: dir, scope: "local", kind: "postgres",
        connectCommand: "psql --password Xk9#mPq2vLzR8nQw",
      }),
      (e) => e instanceof Error,
      "local literal must throw with no config"
    );
  } finally { rmTmp(dir); }
});

test("LOCAL-SWITCH: invalid config JSON → strict (no silent relax)", () => {
  const dir = mkTmpProject("ls-badcfg");
  try {
    fs.mkdirSync(path.join(dir, ".gsd-t"), { recursive: true });
    fs.writeFileSync(path.join(dir, ".gsd-t", "env-registry-config.json"), "{not valid json", "utf8");
    assert.throws(
      () => reg.recordEnvironment({
        projectDir: dir, scope: "local", kind: "postgres",
        connectCommand: "psql --password Xk9#mPq2vLzR8nQw",
      }),
      (e) => e instanceof Error,
      "invalid config must fall back to strict"
    );
  } finally { rmTmp(dir); }
});

test("LOCAL-SWITCH: opted-in local row STILL fails the overflow-column corruption check", () => {
  const dir = mkProjectWithConfig("ls-overflow", { allowLocalLiteral: true });
  try {
    const p = path.join(dir, "docs", "infrastructure.md");
    let content = infra(dir);
    const cells = [
      "local-postgres", "local", "postgres", "localhost", "5432", "appdb", "password",
      "local (.env)", "DATABASE_URL", "—", 'psql "$DATABASE_URL"', "none", "NO",
      "2026-07-17", "S3cr3t!Pass", // 15th overflow cell
    ];
    content = content.replace(reg.ENV_MARKER_END, "| " + cells.join(" | ") + " |\n" + reg.ENV_MARKER_END);
    fs.writeFileSync(p, content, "utf8");
    assert.equal(envCheck(dir).ok, false, "overflow corruption must fail even for an opted-in local row");
  } finally { rmTmp(dir); }
});

// ═══════════════════════════════════════════════════════════════════════════
// LEAK REMEDIATION (user-locked 2026-07-16). When a HUMAN is present (capture
// trigger / provisioning task), a caught leak isn't just rejected — the workflow
// calls detectCommandLeak / proposeRemediation to SHOW the leaked secret and
// OFFER rotate-vs-move into the vault. The module only DETECTS + PROPOSES; it
// never rotates, writes a vault, or prompts.
// ═══════════════════════════════════════════════════════════════════════════

test("REMEDIATION: detectCommandLeak extracts an embedded URL credential", () => {
  const r = reg.detectCommandLeak("psql postgres://admin:hunter2SuperSecret@h.example.com/db");
  assert.equal(r.leaked, true);
  assert.equal(r.secret, "hunter2SuperSecret");
  assert.equal(r.kind, "url-embedded-credential");
  assert.ok(r.rewriteHint.includes("$SECRET"));
});

test("REMEDIATION: detectCommandLeak extracts an inline flag literal", () => {
  const r = reg.detectCommandLeak("psql --password Xk9#mPq2vLzR8nQw");
  assert.equal(r.leaked, true);
  assert.equal(r.secret, "Xk9#mPq2vLzR8nQw");
  assert.equal(r.kind, "inline-literal");
});

test("REMEDIATION: detectCommandLeak returns leaked:false for a clean $VAR command", () => {
  assert.equal(reg.detectCommandLeak('psql "$DATABASE_URL"').leaked, false);
  assert.equal(reg.detectCommandLeak("psql -h db.example.com -U binvoice").leaked, false);
});

test("REMEDIATION: proposeRemediation names the secret, vault, $VAR, and rewritten command", () => {
  const dir = mkTmpProject("rem-prop");
  try {
    const p = reg.proposeRemediation(dir, "psql postgres://admin:hunter2SuperSecret@h.example.com/db");
    assert.equal(p.needed, true);
    assert.equal(p.detectedSecret, "hunter2SuperSecret");
    assert.ok(p.vault);
    assert.ok(p.suggestedEnvVarName);
    assert.ok(p.rewrittenCommand.includes("$" + p.suggestedEnvVarName));
    assert.ok(p.choices.rotate && p.choices.move, "must offer BOTH rotate and move");
  } finally { rmTmp(dir); }
});

test("REMEDIATION: proposeRemediation returns needed:false for a clean command", () => {
  const dir = mkTmpProject("rem-clean");
  try {
    assert.equal(reg.proposeRemediation(dir, 'psql "$DATABASE_URL"').needed, false);
  } finally { rmTmp(dir); }
});
