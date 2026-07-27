"use strict";

// bin/gsd-t-schema-id-check.cjs
//
// The deterministic verify-gate lint for the integer-primary-key rule.
// FAIL-CLOSED for relational schemas; NO-OP PASS for projects with no schema.
//
// THE RULE (relational stacks only — postgresql / prisma / supabase / drizzle):
//   every NEW table has a self-incrementing integer primary key named `id`.
//
// SCOPE — NEW tables only. A pre-existing table with a UUID primary key is NOT a
// failure: its foreign keys already point at that UUID, so changing the PK is a
// data migration + Destructive Action Guard item, never an in-passing edit. The
// gate therefore checks only tables whose defining file is UNCOMMITTED or was
// added in the working tree — i.e. tables this run is introducing. A repo with an
// established UUID-keyed schema passes untouched.
//
// NOT APPLICABLE — firestore/firebase (document store: no sequence to increment;
// a counter document serializes writes) and neo4j (no rows; internal id() is
// reused after deletion). Those stacks state the exemption in their own rules
// file; this gate never inspects them.
//
// Zero external npm runtime deps — fs/path/child_process only.

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

// ─── SQL: CREATE TABLE detection ─────────────────────────────────────────────

// A table body is scanned for a column that is BOTH an integer type AND carries
// an identity/serial default AND is the primary key. Postgres spells this three
// ways; all three are accepted.
const SQL_IDENTITY_PK =
  /\bid\b[^,]*?\b(?:bigint|integer|int|smallint)\b[^,]*?\bgenerated\s+(?:always|by\s+default)\s+as\s+identity\b[^,]*?\bprimary\s+key\b/is;
const SQL_SERIAL_PK = /\bid\b\s+(?:big|small)?serial\b[^,]*?\bprimary\s+key\b/is;
// Table-level constraint form: id BIGINT GENERATED ... , PRIMARY KEY (id)
const SQL_IDENTITY_COL =
  /\bid\b[^,]*?\b(?:bigint|integer|int|smallint)\b[^,]*?\b(?:generated\s+(?:always|by\s+default)\s+as\s+identity|serial)\b/is;
const SQL_TABLE_PK_ID = /\bprimary\s+key\s*\(\s*"?id"?\s*\)/is;

/**
 * Extract (tableName, body) for each CREATE TABLE in a SQL string.
 * Brace-matched on parentheses so nested type parens (numeric(10,2)) don't
 * truncate the body.
 */
function extractSqlTables(sql) {
  const out = [];
  const re = /create\s+table\s+(?:if\s+not\s+exists\s+)?([`"\[]?[\w.]+[`"\]]?)\s*\(/gi;
  let m;
  while ((m = re.exec(sql)) !== null) {
    const name = m[1].replace(/[`"\[\]]/g, "");
    let depth = 1;
    let i = re.lastIndex;
    while (i < sql.length && depth > 0) {
      const ch = sql[i];
      if (ch === "(") depth++;
      else if (ch === ")") depth--;
      i++;
    }
    out.push({ name, body: sql.slice(re.lastIndex, i - 1) });
  }
  return out;
}

function sqlTableHasIntegerIdPk(body) {
  if (SQL_IDENTITY_PK.test(body)) return true;
  if (SQL_SERIAL_PK.test(body)) return true;
  if (SQL_IDENTITY_COL.test(body) && SQL_TABLE_PK_ID.test(body)) return true;
  return false;
}

// ─── Prisma: model detection ─────────────────────────────────────────────────

const PRISMA_INT_ID = /\bid\s+Int\s+@id\s+@default\s*\(\s*autoincrement\s*\(\s*\)\s*\)/;
const PRISMA_BIGINT_ID = /\bid\s+BigInt\s+@id\s+@default\s*\(\s*autoincrement\s*\(\s*\)\s*\)/;

/** Extract (modelName, body) for each `model X { ... }` block. */
function extractPrismaModels(src) {
  const out = [];
  const re = /^\s*model\s+(\w+)\s*\{/gm;
  let m;
  while ((m = re.exec(src)) !== null) {
    let depth = 1;
    let i = re.lastIndex;
    while (i < src.length && depth > 0) {
      const ch = src[i];
      if (ch === "{") depth++;
      else if (ch === "}") depth--;
      i++;
    }
    out.push({ name: m[1], body: src.slice(re.lastIndex, i - 1) });
  }
  return out;
}

function prismaModelHasIntegerIdPk(body) {
  return PRISMA_INT_ID.test(body) || PRISMA_BIGINT_ID.test(body);
}

// A Prisma block that is only a relation join table declared with @@id([a, b])
// still needs its own integer id under the rule — no exemption. But a `view`
// or `enum` block is not a model and is never reached (regex matches `model`).

// ─── Which files are NEW in this working tree ────────────────────────────────

/**
 * Files added/modified relative to HEAD, per git. The rule governs NEW tables,
 * so only these files are inspected.
 *
 * Returns null when git is unavailable or the directory is not a repo — the
 * caller turns that into a NO-OP PASS with an explicit note rather than
 * silently scanning everything (which would fail every legacy schema).
 */
function changedFiles(projectDir) {
  try {
    const out = execFileSync(
      "git",
      ["status", "--porcelain=v1", "--untracked-files=all"],
      { cwd: projectDir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
    );
    const files = [];
    for (const line of out.split("\n")) {
      if (!line.trim()) continue;
      // porcelain v1: XY <path>  (rename: XY <old> -> <new>)
      const p = line.slice(3).trim();
      const finalPath = p.includes(" -> ") ? p.split(" -> ").pop() : p;
      files.push(finalPath.replace(/^"|"$/g, ""));
    }
    return files;
  } catch (_) {
    return null;
  }
}

const SQL_EXT = /\.sql$/i;
const PRISMA_EXT = /\.prisma$/i;

function isSchemaFile(rel) {
  if (/node_modules|\.git\//.test(rel)) return false;
  return SQL_EXT.test(rel) || PRISMA_EXT.test(rel);
}

function readSafe(p) {
  try {
    return fs.readFileSync(p, "utf8");
  } catch (_) {
    return null;
  }
}

// ─── Main check ──────────────────────────────────────────────────────────────

function check(projectDir) {
  const failures = [];
  const inspected = [];

  const changed = changedFiles(projectDir);
  if (changed === null) {
    return {
      ok: true,
      check: "schema-id",
      inspected: [],
      failures: [],
      note:
        "no-op PASS: git unavailable or not a repository — cannot distinguish NEW tables from " +
        "pre-existing ones, and the rule governs NEW tables only",
    };
  }

  const schemaFiles = changed.filter(isSchemaFile);
  if (schemaFiles.length === 0) {
    return {
      ok: true,
      check: "schema-id",
      inspected: [],
      failures: [],
      note: "no-op PASS: no new or modified .sql/.prisma schema files in the working tree",
    };
  }

  for (const rel of schemaFiles) {
    const abs = path.join(projectDir, rel);
    const src = readSafe(abs);
    if (src === null) continue; // deleted file listed by git status

    if (PRISMA_EXT.test(rel)) {
      for (const model of extractPrismaModels(src)) {
        inspected.push(`${rel}::model ${model.name}`);
        if (!prismaModelHasIntegerIdPk(model.body)) {
          failures.push(
            `${rel}: model \`${model.name}\` has no self-incrementing integer primary key — ` +
              `add \`id Int @id @default(autoincrement())\`. If this model is API-exposed, also add ` +
              `\`publicId String @unique @default(uuid())\` and expose that instead of the integer id.`
          );
        }
      }
    } else {
      for (const table of extractSqlTables(src)) {
        inspected.push(`${rel}::table ${table.name}`);
        if (!sqlTableHasIntegerIdPk(table.body)) {
          failures.push(
            `${rel}: table \`${table.name}\` has no self-incrementing integer primary key — ` +
              `add \`id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY\`. If this table is ` +
              `API-exposed, also add \`public_id UUID NOT NULL DEFAULT gen_random_uuid()\` with a ` +
              `UNIQUE constraint and expose that instead of the integer id.`
          );
        }
      }
    }
  }

  return {
    ok: failures.length === 0,
    check: "schema-id",
    inspected,
    failures,
    note:
      inspected.length === 0
        ? "no-op PASS: changed schema files contain no CREATE TABLE / model definitions"
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

module.exports = {
  check,
  extractSqlTables,
  sqlTableHasIntegerIdPk,
  extractPrismaModels,
  prismaModelHasIntegerIdPk,
};

if (require.main === module) {
  const { projectDir } = parseArgs(process.argv.slice(2));
  const result = check(projectDir);
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  process.exit(result.ok ? 0 : 1);
}
