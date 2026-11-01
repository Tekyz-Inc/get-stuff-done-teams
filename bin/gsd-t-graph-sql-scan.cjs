#!/usr/bin/env node
'use strict';

/**
 * gsd-t-graph-sql-scan.cjs
 *
 * Reads plain SQL text — a `.sql` file, or a string in code — and reports the
 * tables it declares and the tables it reads or writes. A keyword scanner, not
 * a full SQL parser: SQL in code is often a fragment or carries `${…}` holes,
 * which a full parser rejects. It only needs the table name after a small,
 * fixed set of SQL words; the query layer keeps only names that turn out to be
 * declared tables, so a stray match ("year FROM created") is dropped there.
 * [RULE] raw-sql-tables-in-graph
 *
 * Exported API:
 *   scanSql(text, opts) → { decls, uses, holes }
 *     text        — SQL text; a template hole is written as holeMarker(n)
 *     opts.line   — line number of the first character of `text` (default 1)
 *   decls: [{ table, schema, line, kind: 'create'|'alter', columns, foreignKeys, dropped, unresolved }]
 *   uses:  [{ table, schema, op, access: 'READ'|'WRITE', line }]
 *   holes: [{ hole, op, access, line }]  — a table position filled by template hole n
 *   unread: [{ line, why }]  — text the scanner could not read past (a quote that never closes)
 *   open:   [{ op, access, line, why }] — a write whose table is not written as a name here:
 *           the text ends where the name should be (`'DELETE FROM '` — added elsewhere), or a
 *           placeholder stands there (`??`, `%s`, `{}`, `:t`, `"tb_${t}"`). Listed, never skipped.
 *   looksLikeSql(text) → boolean (a statement word is present)
 *
 * CLI (for testing): node bin/gsd-t-graph-sql-scan.cjs <file.sql>
 */

const fs = require('fs');

const HOLE_RE = /\u0001(\d+)\u0001/;
function holeMarker(n) { return `\u0001${n}\u0001`; }

const STATEMENT_WORDS = /\b(select|insert|replace|update|delete|with|create|alter|merge|truncate|copy)\b/i;
function looksLikeSql(text) { return STATEMENT_WORDS.test(text); }

// Schemas that hold the database's own catalog, never an app table.
const CATALOG_SCHEMAS = new Set(['information_schema', 'pg_catalog']);
// Words that end a FROM list or cannot be an alias.
const CLAUSE_WORDS = new Set([
  'where', 'group', 'order', 'having', 'limit', 'offset', 'join', 'inner', 'left', 'right', 'full', 'cross',
  'natural', 'on', 'using', 'union', 'intersect', 'except', 'returning', 'set', 'values', 'for', 'window',
  'lateral', 'select', 'from', 'into', 'as', 'when', 'then', 'else', 'end', 'and', 'or', 'not', 'fetch',
]);
const CONSTRAINT_WORDS = new Set(['constraint', 'primary', 'foreign', 'unique', 'check', 'exclude', 'like']);
const TABLE_MODIFIERS = new Set(['global', 'local', 'temp', 'temporary', 'unlogged']);
// INSERT [OR REPLACE | OR IGNORE | IGNORE | LOW_PRIORITY …] INTO — the words that may sit between.
const INSERT_MODIFIERS = new Set(['or', 'replace', 'ignore', 'abort', 'fail', 'rollback', 'low_priority', 'delayed', 'high_priority']);
// MySQL `UPDATE a JOIN b … SET`: words that start a join after the updated table.
const JOIN_START = new Set(['join', 'inner', 'left', 'right', 'straight_join', 'cross']);
// UPDATE [ONLY | LOW_PRIORITY | IGNORE] table — the words that may sit between.
const UPDATE_MODIFIERS = new Set(['only', 'low_priority', 'ignore']);
// What follows the table of an INSERT written without INTO (MySQL, T-SQL).
const INSERT_BODY_WORDS = new Set(['values', 'value', 'set', 'select', 'default']);
// What may follow the table of `DELETE t …` with no FROM: the end, `;` or WHERE.
function endsDelete(tok) {
  if (tok === undefined) return true;
  return isPunct(tok, ';') ? true : kw(tok, 'where');
}
// DELETE [LOW_PRIORITY] [QUICK] [IGNORE] — MySQL's words before the tables.
const DELETE_MODIFIERS = new Set(['low_priority', 'quick', 'ignore']);
// Words that run a string as SQL (PL/pgSQL EXECUTE, T-SQL EXEC / sp_executesql).
const DYNAMIC_SQL_WORDS = new Set(['execute', 'exec', 'sp_executesql']);
// `FOR UPDATE`, `FOR NO KEY UPDATE`, `DO UPDATE`, `ON UPDATE CASCADE` are not writes.
const NOT_AN_UPDATE_AFTER = new Set(['for', 'key', 'do', 'on']);

// ── Tokenizer ────────────────────────────────────────────────────────────────

/** End of a run of name characters and template holes with no space between (`tb_${t}`). */
function gluedEnd(text, k) {
  for (;;) {
    if (text[k] === '\u0001') {
      const m = HOLE_RE.exec(text.slice(k, k + 16));
      if (!m || m.index !== 0) return k;
      k += m[0].length;
      continue;
    }
    if (k < text.length && /[A-Za-z0-9_]/.test(text[k])) { k++; continue; }
    return k;
  }
}

/** A quoted name: one whole hole is a hole; a hole beside other text is part-runtime ('mixed'). */
function quotedName(v, t, line) {
  if (!v.includes('\u0001')) return { t, v, line };
  const m = /^\u0001(\d+)\u0001$/.exec(v.trim());
  return m ? { t: 'hole', v: Number(m[1]), line } : { t: 'mixed', v, line };
}

/**
 * → { toks: [{ t: 'id'|'qid'|'str'|'num'|'p'|'hole'|'param'|'mixed', v, line }], unread } — comments dropped.
 * 'mixed' is a name built partly from a template hole (`tb_${t}`): no table can be read from it.
 * A quote or comment that never closes swallows the rest of the text; that is
 * reported in `unread`, never passed over quietly.
 */
function tokenize(text, firstLine) {
  const toks = [];
  const unread = [];
  let line = firstLine;
  let i = 0;
  const n = text.length;
  while (i < n) {
    const c = text[i];
    if (c === '\n') { line++; i++; continue; }
    if (c === ' ' || c === '\t' || c === '\r') { i++; continue; }
    if (c === '-' && text[i + 1] === '-') { while (i < n && text[i] !== '\n') i++; continue; }
    if (c === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      if (end === -1) unread.push({ line, why: 'a /* comment never closes — the SQL after it was not read' });
      const stop = end === -1 ? n : end + 2;
      for (let k = i; k < stop; k++) if (text[k] === '\n') line++;
      i = stop;
      continue;
    }
    if (c === '\u0001') {
      const m = HOLE_RE.exec(text.slice(i, i + 16));
      if (m && m.index === 0) {
        const after = i + m[0].length;
        const end = gluedEnd(text, after);
        if (end > after) { toks.push({ t: 'mixed', v: text.slice(i, end), line }); i = end; continue; }
        toks.push({ t: 'hole', v: Number(m[1]), line });
        i = after;
        continue;
      }
      i++;
      continue;
    }
    if (c === "'") {
      let k = i + 1;
      const startLine = line;
      // E'…' (an escape string) lets a backslash escape the quote.
      const prevTok = toks[toks.length - 1];
      const escapes = prevTok !== undefined && prevTok.t === 'id' && (prevTok.v === 'E' || prevTok.v === 'e') && text[i - 1] === prevTok.v;
      while (k < n) {
        if (escapes && text[k] === '\\') { k += 2; continue; }
        if (text[k] === "'" && text[k + 1] === "'") { k += 2; continue; }
        if (text[k] === "'") break;
        if (text[k] === '\n') line++;
        k++;
      }
      if (k >= n) unread.push({ line: startLine, why: 'a quoted string never closes — the SQL after it was not read' });
      toks.push({ t: 'str', v: text.slice(i + 1, k), line: startLine });
      i = k + 1;
      continue;
    }
    if (c === '"' || c === '`') {
      const k = text.indexOf(c, i + 1);
      if (k === -1) unread.push({ line, why: 'a quoted name never closes — the SQL after it was not read' });
      const stop = k === -1 ? n : k;
      // A MySQL `name` folds like a bare name; a "name" keeps its case.
      toks.push(quotedName(text.slice(i + 1, stop), c === '"' ? 'qid' : 'id', line));
      i = stop + 1;
      continue;
    }
    if (c === '$') {
      // $1 placeholder, or a $tag$ opening or closing a quoted body. A body is most
      // often a function or trigger, whose SQL writes tables too: it is read as
      // SQL, and each edge of it ends a statement.
      const num = /^\$\d+/.exec(text.slice(i, i + 12));
      if (num) { toks.push({ t: 'param', v: num[0], line }); i += num[0].length; continue; }
      const tag = /^\$[A-Za-z_]*\$/.exec(text.slice(i, i + 64));
      if (tag) {
        toks.push({ t: 'p', v: ';', line });
        i += tag[0].length;
        continue;
      }
      i++;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let k = i + 1;
      // `t$$`: a `$$` right after a name closes a quoted body, it is not part of the name.
      while (k < n && /[A-Za-z0-9_$]/.test(text[k]) && !(text[k] === '$' && text[k + 1] === '$')) k++;
      if (text[k] === '\u0001') {
        const end = gluedEnd(text, k);
        toks.push({ t: end > k ? 'mixed' : 'id', v: text.slice(i, end), line });
        i = end;
        continue;
      }
      toks.push({ t: 'id', v: text.slice(i, k), line });
      i = k;
      continue;
    }
    if (/[0-9]/.test(c)) {
      let k = i + 1;
      while (k < n && /[0-9.]/.test(text[k])) k++;
      toks.push({ t: 'num', v: text.slice(i, k), line });
      i = k;
      continue;
    }
    toks.push({ t: 'p', v: c, line });
    i++;
  }
  return { toks, unread };
}

// ── Helpers over the token list ──────────────────────────────────────────────

const kw = (tok, word) => tok !== undefined && tok.t === 'id' && tok.v.toLowerCase() === word;
const kwIn = (tok, words) => tok !== undefined && tok.t === 'id' && words.has(tok.v.toLowerCase());
const isName = (tok) => tok !== undefined && (tok.t === 'id' || tok.t === 'qid');
const isPunct = (tok, ch) => tok !== undefined && tok.t === 'p' && tok.v === ch;
/** A table reference can start here: a name or a template hole. */
const isRefStart = (tok) => tok !== undefined && (tok.t === 'id' || tok.t === 'qid' || tok.t === 'hole');
/** An unquoted SQL name folds to lower case; a quoted one keeps its case. */
const nameOf = (tok) => (tok.t === 'qid' ? tok.v : tok.v.toLowerCase());

const PART_TYPES = new Set(['id', 'qid', 'hole']);
const isPart = (tok) => tok !== undefined && PART_TYPES.has(tok.t);

/** One part of a dotted name at `i`: a name, a hole, or T-SQL's `[name]`. → { tok, next } | null */
function namePart(toks, i) {
  const a = toks[i];
  if (isPunct(a, '[')) {
    const b = toks[i + 1];
    if (isPart(b) && isPunct(toks[i + 2], ']')) return { tok: b, next: i + 3 };
    return null;
  }
  if (!isPart(a)) return null;
  return { tok: a, next: i + 1 };
}

/**
 * A table reference at `i`: `name`, `schema.name`, `db.schema.name`, or a template
 * hole in the table's place. A hole in an earlier part only picks the schema.
 * → { table, schema, hole, next } | null. `next` is the index after it.
 * `inQuery`: after FROM / JOIN, `name(` is a function call (`unnest($1)`), not a
 * table; after INSERT INTO / CREATE TABLE / REFERENCES the `(` opens a column list.
 */
function readTableRef(toks, i, inQuery) {
  const parts = [];
  let next = i;
  for (;;) {
    const part = namePart(toks, next);
    if (part === null) return null; // not a name, or a dotted name cut short (`public.`)
    parts.push(part.tok);
    next = part.next;
    if (!isPunct(toks[next], '.')) break;
    // `users ...` (an ellipsis) ends the name; `public.` at the end is a name cut short.
    if (isPunct(toks[next + 1], '.')) break;
    next++;
  }
  const last = parts[parts.length - 1];
  const schemaTok = parts.length > 1 ? parts[parts.length - 2] : null;
  const schema = schemaTok !== null && schemaTok.t !== 'hole' ? nameOf(schemaTok) : null;
  if (last.t === 'hole') return { table: null, schema, hole: last.v, next };
  if (inQuery === true && parts.length === 1 && isPunct(toks[next], '(')) return null;
  return { table: nameOf(last), schema, hole: null, next };
}

/** Index of the `)` matching the `(` at `open`. */
function closeParen(toks, open) {
  let depth = 0;
  for (let k = open; k < toks.length; k++) {
    if (toks[k].t !== 'p') continue;
    if (toks[k].v === '(') depth++;
    else if (toks[k].v === ')') { depth--; if (depth === 0) return k; }
  }
  return toks.length - 1;
}

/** Split tokens [from, to) at top-level commas. */
function splitTopLevel(toks, from, to) {
  const parts = [];
  let depth = 0;
  let start = from;
  for (let k = from; k < to; k++) {
    const tok = toks[k];
    if (tok.t !== 'p') continue;
    if (tok.v === '(') depth++;
    else if (tok.v === ')') depth--;
    else if (tok.v === ',' && depth === 0) { parts.push(toks.slice(start, k)); start = k + 1; }
  }
  if (start < to) parts.push(toks.slice(start, to));
  return parts;
}

/** Names inside `( a, b )` starting at the `(`. */
function nameList(toks, open) {
  if (!isPunct(toks[open], '(')) return [];
  const close = closeParen(toks, open);
  return toks.slice(open + 1, close).filter(isName).map(nameOf);
}

/** `REFERENCES t (col)` at index of REFERENCES → { table, column } */
function readReferences(toks, k) {
  const ref = readTableRef(toks, k + 1);
  if (ref === null || ref.table === null) return null;
  const cols = nameList(toks, ref.next);
  return { table: ref.table, column: cols.length ? cols[0] : null };
}

/** One column definition: `name TYPE [NOT NULL] [PRIMARY KEY] [UNIQUE] [REFERENCES t(c)]`. */
function readColumn(part) {
  const col = { name: nameOf(part[0]), sqlName: nameOf(part[0]), type: null, notNull: false, primaryKey: false };
  const typeTok = part[1];
  col.type = typeTok !== undefined && typeTok.t === 'id' ? typeTok.v.toLowerCase() : null;
  if (col.type === null) col.unresolved = 'no type after the column name';
  for (let k = 2; k < part.length; k++) {
    if (kw(part[k], 'not') && kw(part[k + 1], 'null')) col.notNull = true;
    if (kw(part[k], 'primary') && kw(part[k + 1], 'key')) { col.primaryKey = true; col.notNull = true; }
    if (kw(part[k], 'unique')) col.unique = true;
    if (kw(part[k], 'references')) {
      const ref = readReferences(part, k);
      if (ref) col.references = ref;
      else col.unresolved = 'references a table the scanner cannot read';
    }
  }
  return col;
}

/** A table-level constraint inside CREATE TABLE ( … ) or ALTER TABLE … ADD. */
function readConstraint(part, decl) {
  let k = 0;
  if (kw(part[k], 'constraint')) k += 2;
  if (kw(part[k], 'primary') && kw(part[k + 1], 'key')) {
    const cols = nameList(part, k + 2);
    for (const c of decl.columns) if (cols.includes(c.name)) { c.primaryKey = true; c.notNull = true; }
    return;
  }
  if (kw(part[k], 'foreign') && kw(part[k + 1], 'key')) {
    const cols = nameList(part, k + 2);
    const refAt = part.findIndex((t, idx) => idx > k && kw(t, 'references'));
    const ref = refAt === -1 ? null : readTableRef(part, refAt + 1);
    if (ref && ref.table) decl.foreignKeys.push({ columns: cols, table: ref.table, foreignColumns: nameList(part, ref.next) });
    else decl.unresolved.push('foreign key whose target the scanner cannot read');
  }
}

// ── Statement readers ────────────────────────────────────────────────────────

function readCreateTable(toks, i, out) {
  // CREATE [OR REPLACE] [GLOBAL|LOCAL] [TEMP|TEMPORARY|UNLOGGED] TABLE [IF NOT EXISTS] name
  let k = i + 1;
  if (kw(toks[k], 'or') && kw(toks[k + 1], 'replace')) k += 2;
  while (kwIn(toks[k], TABLE_MODIFIERS)) k++;
  if (!kw(toks[k], 'table')) return i + 1;
  k++;
  if (kw(toks[k], 'if') && kw(toks[k + 1], 'not') && kw(toks[k + 2], 'exists')) k += 3;
  const ref = readTableRef(toks, k);
  if (ref === null || ref.table === null) return k; // a computed name declares nothing knowable
  const decl = { table: ref.table, schema: ref.schema, line: toks[k].line, kind: 'create', columns: [], foreignKeys: [], dropped: [], unresolved: [] };
  const open = ref.next;
  if (isPunct(toks[open], '(')) {
    const close = closeParen(toks, open);
    for (const part of splitTopLevel(toks, open + 1, close)) {
      if (!part.length) continue;
      if (kwIn(part[0], CONSTRAINT_WORDS)) readConstraint(part, decl);
      else if (isName(part[0])) decl.columns.push(readColumn(part));
    }
    out.decls.push(decl);
    return close + 1;
  }
  decl.unresolved.push('table built from a query (CREATE TABLE … AS) — columns not listed');
  out.decls.push(decl);
  return open;
}

function readAlterTable(toks, i, out) {
  let k = i + 2; // ALTER TABLE
  if (kw(toks[k], 'if') && kw(toks[k + 1], 'exists')) k += 2;
  if (kw(toks[k], 'only')) k++;
  const ref = readTableRef(toks, k);
  if (ref === null || ref.table === null) return k;
  const decl = { table: ref.table, schema: ref.schema, line: toks[k].line, kind: 'alter', columns: [], foreignKeys: [], dropped: [], unresolved: [] };
  let end = ref.next;
  while (end < toks.length && !isPunct(toks[end], ';')) end++;
  for (const part of splitTopLevel(toks, ref.next, end)) {
    if (kw(part[0], 'add')) {
      let a = 1;
      if (kw(part[a], 'column')) a++;
      if (kw(part[a], 'if') && kw(part[a + 1], 'not') && kw(part[a + 2], 'exists')) a += 3;
      const rest = part.slice(a);
      if (kwIn(rest[0], CONSTRAINT_WORDS)) readConstraint(rest, decl);
      else if (isName(rest[0])) decl.columns.push(readColumn(rest));
    } else if (kw(part[0], 'drop')) {
      let a = 1;
      if (kw(part[a], 'column')) a++;
      if (kw(part[a], 'constraint')) continue;
      if (kw(part[a], 'if') && kw(part[a + 1], 'exists')) a += 2;
      if (isName(part[a])) decl.dropped.push(nameOf(part[a]));
    } else if (kw(part[0], 'rename') && kw(part[1], 'column') && isName(part[2]) && kw(part[3], 'to') && isName(part[4])) {
      decl.dropped.push(nameOf(part[2]));
      decl.columns.push({ name: nameOf(part[4]), sqlName: nameOf(part[4]), type: null, notNull: false, primaryKey: false, renamedFrom: nameOf(part[2]) });
    }
  }
  if (decl.columns.length + decl.dropped.length + decl.foreignKeys.length > 0) out.decls.push(decl);
  return end;
}

const ADDED_ELSEWHERE = 'the table name is added to this SQL elsewhere';
/** Why no table can be read at `i`: the text ends there, or something else stands in its place. */
function openWhy(toks, i, verb) {
  for (let k = i; k < toks.length; k++) {
    if (!isName(toks[k]) && !isPunct(toks[k], '.')) return `the table after ${verb} is not written as a name — it is filled in while running`;
  }
  return ADDED_ELSEWHERE;
}

/**
 * No table can be read at `i`. A write there is listed, never skipped: a missed
 * writer reads as safe to change. Its line is the word before the table's place,
 * since the text may end right there. → index to go on from.
 */
function noTableAt(toks, i, op, access, out) {
  if (access === 'WRITE') out.open.push({ op, access, line: toks[i - 1].line, why: openWhy(toks, i, op.toUpperCase()) });
  return i < toks.length ? i + 1 : i;
}

/** Push a use (or a hole) for the table ref at `i`. → index after it, or i+1. */
function useAt(toks, i, op, access, out) {
  const ref = readTableRef(toks, i, access === 'READ');
  if (ref === null) return noTableAt(toks, i, op, access, out);
  if (ref.hole !== null) {
    out.holes.push({ hole: ref.hole, op, access, line: toks[i].line });
  } else if (!(ref.schema !== null && CATALOG_SCHEMAS.has(ref.schema))) {
    out.uses.push({ table: ref.table, schema: ref.schema, op, access, line: toks[i].line });
  }
  return ref.next;
}

/** T-SQL table hints `WITH (ROWLOCK)` after a table name. → index after them. */
function skipHints(toks, k) {
  return kw(toks[k], 'with') && isPunct(toks[k + 1], '(') ? closeParen(toks, k + 1) + 1 : k;
}

// How a table placeholder starts: `?` / `??`, `%s`, `{}` / `{t}`, `:t`. (`update().set()` is a method call.)
const PLACEHOLDER_PUNCT = new Set(['?', '%', '{', ':']);
function isPlaceholder(tok) {
  if (tok === undefined) return false;
  if (tok.t === 'mixed') return true;
  return tok.t === 'p' && PLACEHOLDER_PUNCT.has(tok.v);
}

/** `TOP (n)` after INSERT / UPDATE / DELETE. → index after it. */
function skipTop(toks, k) {
  return kw(toks[k], 'top') && isPunct(toks[k + 1], '(') ? closeParen(toks, k + 1) + 1 : k;
}

/**
 * MySQL `DELETE a FROM accounts a JOIN audit b`: a name before FROM may be an alias
 * given after FROM. → the table it stands for (the name itself when no alias matches).
 */
const FROM_ITEM_WORDS = new Set(['from', 'join']);
/** Can a table in a FROM list follow this token (FROM, JOIN or a comma)? */
const startsFromItem = (tok) => kwIn(tok, FROM_ITEM_WORDS) ? true : isPunct(tok, ',');

function aliasTable(toks, from, name) {
  for (let k = from; k < toks.length && !isPunct(toks[k], ';'); k++) {
    if (!startsFromItem(toks[k])) continue;
    const ref = readTableRef(toks, k + 1, true);
    if (ref === null || ref.table === null) continue;
    let a = ref.next;
    if (kw(toks[a], 'as')) a++;
    const alias = toks[a] !== undefined && toks[a].t === 'id' && !CLAUSE_WORDS.has(toks[a].v.toLowerCase()) ? toks[a].v.toLowerCase() : null;
    if (alias === name || ref.table === name) return ref.table;
  }
  return name;
}

/** A quoted string that is itself run as SQL: read it, and add what it uses to `out`. */
function scanInner(tok, out) {
  const inner = scanSql(tok.v.split("''").join("'"), { line: tok.line });
  for (const key of ['decls', 'uses', 'holes', 'open']) out[key].push(...inner[key]);
}

/** Is the string at `i` given to a variable (`q := '…'`, `SET @sql = N'…'`)? */
function assignedStr(toks, i) {
  let p = i - 1;
  if (toks[p] !== undefined && toks[p].t === 'id' && (toks[p].v === 'N' || toks[p].v === 'n')) p--;
  return isPunct(toks[p], '=');
}

/** Does an INSERT body (column list, VALUES, SET, SELECT) start at `k`? → k or -1 */
function insertBodyAt(toks, k) {
  if (isPunct(toks[k], '(')) return k;
  return kwIn(toks[k], INSERT_BODY_WORDS) ? k : -1;
}

/** Is one of `words` within the `n` tokens from `k`, before the statement ends? */
function soonAfter(toks, k, words, n) {
  for (let j = k; j < k + n && j < toks.length && !isPunct(toks[j], ';'); j++) {
    if (kwIn(toks[j], words)) return j;
  }
  return -1;
}

/**
 * After UPDATE <ref> a real statement continues `[AS alias] SET`. Text like
 * `Update ${name}` (a UI label) does not, and names no table.
 */
function updateHasSet(toks, k) {
  k = skipHints(toks, k);
  if (kw(toks[k], 'as')) k++;
  if (toks[k] !== undefined && toks[k].t === 'id' && !kw(toks[k], 'set') && !kwIn(toks[k], JOIN_START) && !kw(toks[k], 'with')) k++;
  k = skipHints(toks, k);
  if (kw(toks[k], 'set')) return true;
  // MySQL `UPDATE a JOIN b ON … SET` / `UPDATE a, b SET`: SET comes later in the statement.
  const joinsNext = kwIn(toks[k], JOIN_START);
  if (!joinsNext && !isPunct(toks[k], ',')) return false;
  for (; k < toks.length && !isPunct(toks[k], ';'); k++) if (kw(toks[k], 'set')) return true;
  return false;
}

/**
 * Can CREATE / ALTER start a statement at token `i`? At the start of the text,
 * after `;`, a bracket, a template hole, or a word that opens a block (`GO`,
 * `BEGIN`, `THEN` …). `Failed to create table x` in a message is not one.
 * Only declarations use this: a write found mid-text is kept, since a missed
 * writer reads as safe to change and a stray one names a table that must exist.
 */
const BLOCK_WORDS = new Set(['go', 'begin', 'then', 'else', 'do', 'as', 'loop']);
function statementStart(toks, i) {
  const prev = toks[i - 1];
  if (prev === undefined || prev.t === 'hole') return true;
  if (prev.t === 'p') return prev.v === ';' || prev.v === '(' || prev.v === ')';
  return kwIn(prev, BLOCK_WORDS);
}

// What may follow TRUNCATE <table>: the end, another table, or a TRUNCATE option.
// A styling class list (`truncate ${cls} text-sm`) continues with anything else.
const TRUNCATE_TAIL = new Set(['cascade', 'restrict', 'restart', 'continue']);
const TRUNCATE_PUNCT = new Set([';', ',']);
const TRUNCATE_PUNCT_ARG = new Set([')', ',']);
function truncateEnds(tok) {
  if (tok === undefined) return true;
  if (tok.t === 'p') return TRUNCATE_PUNCT.has(tok.v);
  return kwIn(tok, TRUNCATE_TAIL);
}

/** After a table ref in a FROM list: skip `[AS] alias`, then `, next_table` repeats. */
function readFromList(toks, i, out) {
  let k = useAt(toks, i, 'from', 'READ', out);
  for (;;) {
    if (kw(toks[k], 'as')) k++;
    if (toks[k] !== undefined && toks[k].t === 'id' && !CLAUSE_WORDS.has(toks[k].v.toLowerCase())) k++;
    if (isPunct(toks[k], ',') && isRefStart(toks[k + 1])) {
      k = useAt(toks, k + 1, 'from', 'READ', out);
      continue;
    }
    return k;
  }
}

/**
 * Scan SQL text. A shape it cannot read declares or uses nothing, and the
 * declaration it belongs to names the gap in `unresolved`.
 */
function scanSql(text, opts) {
  const firstLine = opts && opts.line ? opts.line : 1;
  const { toks, unread } = tokenize(text, firstLine);
  const out = { decls: [], uses: [], holes: [], unread, open: [] };
  const trailingSpace = /\s$/.test(text);
  let verb = null; // the statement's leading verb (for USING after DELETE / MERGE)
  for (let i = 0; i < toks.length;) {
    const tok = toks[i];
    if (isPunct(tok, ';')) { verb = null; i++; continue; }
    // `q := 'DELETE FROM t'; EXECUTE q;` — SQL kept in a variable to be run later is SQL too.
    if (tok.t === 'str' && assignedStr(toks, i) && looksLikeSql(tok.v)) { scanInner(tok, out); i++; continue; }
    if (tok.t !== 'id') { i++; continue; }
    const w = tok.v.toLowerCase();
    const prev = toks[i - 1];
    const starts = statementStart(toks, i);
    if (w === 'create' && starts) { verb = 'create'; i = readCreateTable(toks, i, out); continue; }
    if (w === 'alter' && starts && kw(toks[i + 1], 'table')) { verb = 'alter'; i = readAlterTable(toks, i, out); continue; }
    if (w === 'insert' || w === 'replace') {
      let k = i + 1;
      while (kwIn(toks[k], INSERT_MODIFIERS)) k++;
      k = skipTop(toks, k);
      if (kw(toks[k], 'into')) { verb = 'insert'; i = useAt(toks, k + 1, 'insert', 'WRITE', out); continue; }
      // MySQL / T-SQL may leave INTO out: `INSERT t (a) VALUES …`, `REPLACE t SET …`.
      if (starts && k < toks.length) {
        const ref = readTableRef(toks, k, false);
        const body = ref === null ? soonAfter(toks, k + 1, INSERT_BODY_WORDS, 4) : insertBodyAt(toks, ref.next);
        if (body !== -1 && !(ref === null && kwIn(toks[k], INSERT_BODY_WORDS))) { verb = 'insert'; i = useAt(toks, k, 'insert', 'WRITE', out); continue; }
      }
    }
    if (w === 'merge' && kw(toks[i + 1], 'into')) { verb = 'merge'; i = useAt(toks, i + 2, 'merge', 'WRITE', out); continue; }
    if (w === 'merge' && starts) {
      // `MERGE t [AS x] USING …` — INTO left out.
      const ref = readTableRef(toks, i + 1, false);
      let a = ref === null ? -1 : ref.next;
      if (kw(toks[a], 'as')) a++;
      if (a !== -1 && toks[a] !== undefined && toks[a].t === 'id' && !kw(toks[a], 'using')) a++;
      if (kw(toks[a], 'using')) { verb = 'merge'; i = useAt(toks, i + 1, 'merge', 'WRITE', out); continue; }
    }
    if (w === 'delete') {
      // DELETE FROM t, or MySQL's DELETE t1[.*], t2 FROM … (each name may be an alias given after FROM).
      let k = skipTop(toks, i + 1);
      while (kwIn(toks[k], DELETE_MODIFIERS)) k++;
      const targets = [];
      let j = k;
      while (isName(toks[j]) && !kw(toks[j], 'from')) {
        targets.push(toks[j]);
        j++;
        if (isPunct(toks[j], '.') && isPunct(toks[j + 1], '*')) j += 2;
        if (!isPunct(toks[j], ',')) break;
        j++;
      }
      if (targets.length && kw(toks[j], 'from')) {
        verb = 'delete';
        for (const t of targets) out.uses.push({ table: aliasTable(toks, j, nameOf(t)), schema: null, op: 'delete', access: 'WRITE', line: t.line });
        i = j; // the FROM list after it is read as usual
        continue;
      }
      // Oracle / T-SQL `DELETE t WHERE …`, written in capitals.
      if (tok.v === 'DELETE' && !kw(toks[k], 'from')) {
        const ref = readTableRef(toks, k, false);
        const end = ref === null ? undefined : toks[ref.next];
        if (ref !== null && endsDelete(end)) { verb = 'delete'; i = useAt(toks, k, 'delete', 'WRITE', out); continue; }
      }
      if (kw(toks[k], 'from')) {
        verb = 'delete';
        k++;
        if (kw(toks[k], 'only')) k++;
        i = useAt(toks, k, 'delete', 'WRITE', out);
        continue;
      }
    }
    if (w === 'update') {
      if (kwIn(prev, NOT_AN_UPDATE_AFTER)) { i++; continue; }
      let k = i + 1;
      while (kwIn(toks[k], UPDATE_MODIFIERS)) k++;
      k = skipTop(toks, k);
      // `'UPDATE '` at the end: the table is added elsewhere — in capitals starting a statement,
      // or starting a statement before a space (`'update '`). A UI label `Update`, `'Failed to update '`, or a
      // value `'UPDATE'` on its own, is not.
      if (toks[k] === undefined && trailingSpace && (starts || tok.v === 'UPDATE')) { out.open.push({ op: 'update', access: 'WRITE', line: tok.line, why: ADDED_ELSEWHERE }); i++; continue; }
      if (toks[k] === undefined && tok.v === 'UPDATE' && i > 0 && starts) { out.open.push({ op: 'update', access: 'WRITE', line: tok.line, why: ADDED_ELSEWHERE }); i++; continue; }
      const ref = readTableRef(toks, k, false);
      // `UPDATE ?? SET`, `UPDATE %s SET`, `UPDATE {} SET`: a placeholder holds the table.
      // `'UPDATE public.'`: a dotted name cut short — the table is added elsewhere. (`no update needed.` is prose.)
      if (ref === null && tok.v === 'UPDATE' && isName(toks[k]) && isPunct(toks[toks.length - 1], '.') && openWhy(toks, k, 'UPDATE') === ADDED_ELSEWHERE) { i = noTableAt(toks, k, 'update', 'WRITE', out); continue; }
      if (ref === null && isPlaceholder(toks[k]) && soonAfter(toks, k + 1, new Set(['set']), 4) !== -1) { verb = 'update'; i = useAt(toks, k, 'update', 'WRITE', out); continue; }
      if (ref === null || !updateHasSet(toks, ref.next)) { i++; continue; }
      verb = 'update';
      i = useAt(toks, k, 'update', 'WRITE', out);
      continue;
    }
    if (w === 'truncate') {
      // TRUNCATE starts a statement; mid-text (`block truncate ${cls}`) it is a styling class.
      // A styling class is lower case and never followed by TABLE.
      if (!starts) { i++; continue; }
      let k = i + 1;
      const saysTable = kw(toks[k], 'table');
      if (!saysTable && tok.v !== 'TRUNCATE') { i++; continue; }
      if (saysTable) k++;
      if (toks[k] === undefined && (saysTable || trailingSpace)) { out.open.push({ op: 'truncate', access: 'WRITE', line: tok.line, why: ADDED_ELSEWHERE }); i++; continue; }
      if (kw(toks[k], 'only')) k++;
      const ref = readTableRef(toks, k, false);
      // `wal_checkpoint(TRUNCATE)` is a mode passed to a function, not a statement.
      if (ref === null && toks[k] !== undefined && toks[k].t === 'p' && TRUNCATE_PUNCT_ARG.has(toks[k].v)) { i++; continue; }
      if (ref === null && toks[k] !== undefined) { verb = 'truncate'; i = useAt(toks, k, 'truncate', 'WRITE', out); continue; }
      if (ref === null || !truncateEnds(toks[ref.next])) { i++; continue; }
      verb = 'truncate';
      k = useAt(toks, k, 'truncate', 'WRITE', out);
      while (isPunct(toks[k], ',')) k = useAt(toks, k + 1, 'truncate', 'WRITE', out);
      i = k;
      continue;
    }
    if (w === 'copy' && starts && !isPunct(toks[i + 1], '(') && !kw(toks[i + 1], 'into')) {
      // COPY t [(cols)] FROM … loads rows into t; COPY t TO … reads it. `COPY (query) TO` is read as it stands.
      let j = i + 1;
      while (j < toks.length && !isPunct(toks[j], ';') && !kw(toks[j], 'from') && !kw(toks[j], 'to')) {
        j = isPunct(toks[j], '(') ? closeParen(toks, j) + 1 : j + 1;
      }
      if (kw(toks[j], 'from')) { verb = 'copy'; useAt(toks, i + 1, 'copy', 'WRITE', out); i = j + 2; continue; }
      if (kw(toks[j], 'to')) { useAt(toks, i + 1, 'copy', 'READ', out); i = j + 1; continue; }
    }
    if (kwIn(tok, DYNAMIC_SQL_WORDS) && !kwIn(prev, DYNAMIC_SQL_WORDS)) {
      // `EXECUTE 'DELETE FROM t'` inside a function body: the strings it runs are SQL too.
      // (`EXEC sp_executesql N'…'` is one run, read once.)
      for (let k = i + 1; k < toks.length && !isPunct(toks[k], ';'); k++) {
        if (toks[k].t === 'str') scanInner(toks[k], out);
      }
    }
    if (w === 'from') {
      // `IS DISTINCT FROM x` compares values; it names no table.
      if (kw(prev, 'distinct')) { i++; continue; }
      let k = i + 1;
      if (kw(toks[k], 'only')) k++;
      i = readFromList(toks, k, out);
      continue;
    }
    if (w === 'join') { i = useAt(toks, i + 1, 'join', 'READ', out); continue; }
    if (w === 'using' && (verb === 'merge' || verb === 'delete')) { i = useAt(toks, i + 1, 'using', 'READ', out); continue; }
    i++;
  }
  return out;
}

module.exports = { scanSql, looksLikeSql, holeMarker };

// ── CLI entry point ──────────────────────────────────────────────────────────

if (require.main === module) {
  const file = process.argv[2];
  if (!file) {
    process.stderr.write('Usage: gsd-t-graph-sql-scan.cjs <file.sql>\n');
    process.exit(1);
  }
  const result = scanSql(fs.readFileSync(file, 'utf8'));
  process.stdout.write(JSON.stringify({ ok: true, file, ...result }, null, 2) + '\n');
}
