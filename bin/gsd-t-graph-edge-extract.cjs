#!/usr/bin/env node
'use strict';

/**
 * gsd-t-graph-edge-extract.cjs
 *
 * M94 D3-T1 — Fresh edge extraction on the tree-sitter floor.
 *
 * Extracts entities + edges from a single source file using tree-sitter
 * (NOT lifted from bin/graph-parsers.js — built FRESH on tree-sitter).
 *
 * Taxonomy per graph-parser-floor-contract.md §Edge/entity taxonomy:
 *   - import  : file → file ES-module import edge
 *   - require : file → file CommonJS require edge
 *   - export  : exported symbol entity
 *   - function: function entity (def site; includes arrow functions assigned to const)
 *   - class   : class entity (def site)
 *   - method  : method entity (sub-kind of function, parentClass field)
 *   - call-site: function → function call edge (best-effort; keyed by funcId at BOTH ends)
 *
 * Output shape per graph-parser-floor-contract.md §Per-file parse output shape.
 *
 * [RULE] who-calls-function-identity-disambiguated: call-graph edges are keyed
 * by funcId = "file#function" at BOTH endpoints; same-named functions across
 * files are DISTINCT. Per graph-store-schema-contract.md §Function-identity key.
 *
 * Exported API (for D3's indexer and D4's freshness re-index):
 *   extractEdges(absPath, relPath)  → { file, entities, edges, loc }
 *
 * CLI usage (for testing):
 *   node bin/gsd-t-graph-edge-extract.cjs <file> [--repo-root <root>]
 *   Emits JSON envelope on stdout, ANSI on stderr, exit 0=ok / 1=error.
 */

const fs = require('fs');
const path = require('path');

// ── ANSI helpers ─────────────────────────────────────────────────────────────

const C = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
};
function log(msg) { process.stderr.write(msg + '\n'); }
function info(msg) { log(`${C.cyan}[D3]${C.reset} ${msg}`); }
function warn(msg) { log(`${C.yellow}[D3 WARN]${C.reset} ${msg}`); }
function errLog(msg) { log(`${C.red}[D3 ERR]${C.reset} ${msg}`); }

// ── Source-file extensions parsed by the floor ───────────────────────────────

const PARSED_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py']);

// ── Tree-sitter parser lazy loader ───────────────────────────────────────────

let _parsersLoaded = false;
let Parser, TSGrammars, TSX, Python;
let tsAvailable = false;
let pythonAvailable = false;

function ensureParsers() {
  if (_parsersLoaded) return;
  _parsersLoaded = true;
  // M96: resolve the tree-sitter native modules via the multi-location resolver so
  // a COPIED extractor (in a project's bin/) finds them in the GSD-T global package,
  // not the project's own (absent) node_modules. The TS grammar is the MANDATORY
  // floor parser — if it cannot load, FAIL LOUD. A silent fall-through to
  // tsAvailable=false produced an empty graph (0 nodes/edges) that looked like a
  // successful build — the exact silent-degrade this milestone exists to kill.
  const { requireGraphDep } = require('./gsd-t-require-store.cjs');
  try {
    Parser = requireGraphDep('tree-sitter');
    TSGrammars = requireGraphDep('tree-sitter-typescript');
    TSX = TSGrammars.tsx;
    tsAvailable = true;
  } catch (e) {
    throw new Error(
      `code-graph floor parser unavailable: ${e.message} — the graph cannot be built ` +
      `without tree-sitter. Reinstall GSD-T (npx @tekyzinc/gsd-t install).`
    );
  }
  try {
    Python = requireGraphDep('tree-sitter-python');
    pythonAvailable = true;
  } catch {
    /* Python optional — TS/JS still index */
  }
}

function getGrammar(ext) {
  switch (ext) {
    case '.ts':
    case '.mjs':
    case '.cjs':
      return tsAvailable ? TSGrammars.typescript : null;
    case '.tsx':
    case '.jsx':
      return tsAvailable ? TSX : null;
    case '.js':
      return tsAvailable ? TSGrammars.typescript : null;
    case '.py':
      return pythonAvailable ? Python : null;
    default:
      return null;
  }
}

// ── AST helpers ───────────────────────────────────────────────────────────────

/**
 * Walk an AST node's ancestor chain; return true if any ancestor matches type.
 */
function hasAncestorOfType(node, ...types) {
  let p = node.parent;
  while (p) {
    if (types.includes(p.type)) return true;
    p = p.parent;
  }
  return false;
}

/**
 * Return true if the node is a direct child of an export_statement /
 * export_declaration, or if it's a variable_declarator under an exported
 * lexical/variable_declaration.
 */
function isExportedNode(node) {
  const p = node.parent;
  if (!p) return false;
  if (p.type === 'export_statement' || p.type === 'export_declaration') return true;
  // const/let/var: parent is variable_declaration, grandparent is export_statement
  if ((p.type === 'lexical_declaration' || p.type === 'variable_declaration') &&
      p.parent && (p.parent.type === 'export_statement' || p.parent.type === 'export_declaration')) {
    return true;
  }
  return false;
}

// ── Extract import names from an import_statement node ───────────────────────

function extractImportedNames(importNode) {
  const names = [];
  for (let i = 0; i < importNode.namedChildCount; i++) {
    const child = importNode.namedChild(i);
    if (child.type === 'import_clause') {
      for (let j = 0; j < child.namedChildCount; j++) {
        const sub = child.namedChild(j);
        if (sub.type === 'named_imports') {
          for (let k = 0; k < sub.namedChildCount; k++) {
            const spec = sub.namedChild(k);
            const nameNode = spec.childForFieldName('name') || spec;
            if (nameNode) names.push(nameNode.text);
          }
        } else if (sub.type === 'identifier') {
          names.push(sub.text); // default import
        }
      }
    }
  }
  return names;
}

// ── Deduce callee funcId from a call_expression ──────────────────────────────

/**
 * For a call_expression, return the best-effort callee target funcId.
 *
 * Strategy: the call expression's callee is an identifier or member_expression.
 * We cannot statically resolve the callee's file — that requires SCIP.
 * So the target funcId is "UNRESOLVED#<calleeName>" as a floor-tier placeholder.
 * SCIP upgrade will replace these with fully-resolved funcIds.
 *
 * [RULE] who-calls-function-identity-disambiguated: src is the funcId of the
 * enclosing function (or a synthetic route/anonymous caller id, else _toplevel); dst is the
 * callee's best-effort funcId.
 */
function resolveCalleeName(fnNode) {
  if (!fnNode) return null;
  const t = fnNode.type;
  if (t === 'identifier') return fnNode.text;
  if (t === 'member_expression') return fnNode.text; // e.g. obj.method
  if (t === 'subscript_expression') return null;      // computed — unresolvable
  return null;
}

// ── Anonymous callers (route handlers + callbacks) ───────────────────────────
//
// A call inside an anonymous function has no named caller. Before this, such a
// call was credited to `file#_toplevel` (and a const-arrow body was walked twice,
// crediting every call in it to _toplevel as well as to the real function). A
// Hono/Express route file is almost entirely `router.get('/p', mw, async (c) =>
// { helper() })`, so who-calls answered with one meaningless "_toplevel" caller
// or — when the dst never resolved — nothing at all.
//
// Now every anonymous body gets a caller identity that says where it is:
//   route handler   → `file#GET /locations/:id@3217`   (method + path + line)
//   other callback  → the enclosing NAMED function, when there is one
//   top-level cb    → `file#anonymous@<line>`
// [RULE] anonymous-caller-synthesized-never-dropped

const ROUTE_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'del', 'all', 'options', 'head', 'use']);

function isAnonymousFn(node) {
  if (!node) return false;
  if (node.type === 'arrow_function') return true;
  if (node.type === 'function' || node.type === 'function_expression') {
    return !node.childForFieldName('name');
  }
  return false;
}

/**
 * `router.get('/path', ...)` → "GET /path"; anything else → null.
 * The method match is case-insensitive (a domain value, not an identifier).
 */
function routeLabel(fnNode, argsNode) {
  if (!fnNode || fnNode.type !== 'member_expression' || !argsNode) return null;
  const prop = fnNode.childForFieldName('property');
  if (!prop) return null;
  const method = prop.text.toLowerCase();
  if (!ROUTE_METHODS.has(method)) return null;
  const first = argsNode.namedChild(0);
  if (!first || (first.type !== 'string' && first.type !== 'template_string')) return null;
  return `${method.toUpperCase()} ${first.text.slice(1, -1)}`;
}

/**
 * A registration with no anonymous handler (`router.get('/x', requireAuth(), handler)`)
 * is only treated as a route when its first argument looks like a URL path, so a
 * `cache.get('key', compute())` is never mistaken for one.
 */
function isRoutePath(firstArg) {
  if (!firstArg) return false;
  return firstArg.text.slice(1).startsWith('/');
}

// ── Drizzle database tables ──────────────────────────────────────────────────
//
// `export const scheduleEvents = pgTable('schedule_events', { ...columns }, (t) => [...])`
// declares a database table. Before this, it was a constant with no entity, so
// `body scheduleEvents` said not-found and every table question dead-ended.
//
// Now each declaration is a `table` (or `enum`) entity whose meta carries the SQL
// name and the columns (code name, SQL name, type builder, notNull, primaryKey,
// foreign key). Every use of a table in code becomes an edge from the function,
// method or route handler that uses it:
//   TABLE-READ   .from(T) / .innerJoin(T) / db.query.T.* / a column ref T.col
//   TABLE-WRITE  .insert(T) / .update(T) / .delete(T) / a column ref inside one
// dst = `TABLE#<code name>#<operation>@<line>`. The query layer keeps only dsts
// that name an indexed table. [RULE] drizzle-table-entity-and-usage-edges

const TABLE_BUILDERS = { pgTable: 'pg', mysqlTable: 'mysql', sqliteTable: 'sqlite' };
const ENUM_BUILDERS = { pgEnum: 'pg' };
const TABLE_READ_OPS = new Set(['from', 'innerJoin', 'leftJoin', 'rightJoin', 'fullJoin', 'crossJoin']);
const TABLE_WRITE_OPS = new Set(['insert', 'update', 'delete']);
const TABLE_OPS = new Set([...TABLE_READ_OPS, ...TABLE_WRITE_OPS]);
// Identifier positions that declare or re-export a name rather than use it.
const NON_USE_PARENTS = new Set([
  'import_specifier', 'export_specifier', 'namespace_import', 'required_parameter', 'optional_parameter',
]);

function stringValue(node) {
  if (!node) return null;
  if (node.type === 'string') return node.text.slice(1, -1);
  if (node.type === 'template_string' && !node.text.includes('${')) return node.text.slice(1, -1);
  return null;
}

function unwrapParens(node) {
  let n = node;
  while (n && n.type === 'parenthesized_expression') n = n.namedChild(0);
  return n;
}

/** The columns argument: an object literal, or `(t) => ({ ... })`. */
function columnsObject(node) {
  if (!node) return null;
  if (node.type === 'object') return node;
  if (node.type === 'arrow_function') {
    const body = unwrapParens(node.childForFieldName('body'));
    return body && body.type === 'object' ? body : null;
  }
  return null;
}

/** `T` or `schema.T` → "T". Anything else → null. */
function tableNameOf(node) {
  const n = unwrapParens(node);
  if (!n) return null;
  if (n.type === 'identifier') return n.text;
  if (n.type === 'member_expression') {
    const prop = n.childForFieldName('property');
    const obj = n.childForFieldName('object');
    if (prop && obj && obj.type === 'identifier') return prop.text;
  }
  return null;
}

/** `() => users.id` (or `(): AnyPgColumn => users.id`) → { table: 'users', column: 'id' }. */
function referenceTarget(arrow) {
  if (!arrow || arrow.type !== 'arrow_function') return null;
  let body = unwrapParens(arrow.childForFieldName('body'));
  if (body && body.type === 'statement_block') {
    const ret = body.namedChildren.find((c) => c.type === 'return_statement');
    body = ret ? unwrapParens(ret.namedChild(0)) : null;
  }
  if (!body || body.type !== 'member_expression') return null;
  const table = tableNameOf(body.childForFieldName('object'));
  const prop = body.childForFieldName('property');
  return table && prop ? { table, column: prop.text } : null;
}

/** One column: `uuid('flight_school_id').notNull().references(() => flightSchools.id)`. */
function parseColumn(key, value) {
  const col = { name: key, sqlName: null, type: null, notNull: false, primaryKey: false };
  let n = value;
  while (n && n.type === 'call_expression') {
    const fn = n.childForFieldName('function');
    const args = n.childForFieldName('arguments');
    const obj = fn && fn.type === 'member_expression' ? fn.childForFieldName('object') : null;
    if (obj && obj.type === 'call_expression') {
      const method = fn.childForFieldName('property').text;
      if (method === 'notNull') col.notNull = true;
      else if (method === 'primaryKey') col.primaryKey = true;
      else if (method === 'unique') col.unique = true;
      else if (method === 'references') {
        const ref = referenceTarget(args && args.namedChild(0));
        if (ref) col.references = ref;
        else col.unresolved = `references(${(args ? args.text : '').slice(1, 81)}) — target not a plain table.column`;
      }
      n = obj;
      continue;
    }
    // The type builder at the root: uuid('x'), t.uuid('x'), statusEnum('x').
    col.type = fn && fn.type === 'member_expression' ? fn.childForFieldName('property').text : (fn ? fn.text : null);
    col.sqlName = stringValue(args && args.namedChild(0));
    break;
  }
  if (!col.type) col.unresolved = `column value is a ${value ? value.type : 'missing node'}, not a builder call`;
  return col;
}

/** `foreignKey({ columns: [t.a], foreignColumns: [users.id] })` inside the extras argument. */
function collectForeignKeys(node, out) {
  if (!node) return;
  if (node.type === 'call_expression') {
    const fn = node.childForFieldName('function');
    const arg = node.childForFieldName('arguments');
    const obj = arg && arg.namedChild(0);
    if (fn && fn.text === 'foreignKey' && obj && obj.type === 'object') {
      const fk = { columns: [], table: null, foreignColumns: [] };
      for (const pair of obj.namedChildren) {
        if (pair.type !== 'pair') continue;
        const k = pair.childForFieldName('key').text;
        const v = pair.childForFieldName('value');
        if (!v || v.type !== 'array') continue;
        for (const el of v.namedChildren) {
          if (el.type !== 'member_expression') continue;
          const prop = el.childForFieldName('property').text;
          if (k === 'columns') fk.columns.push(prop);
          if (k === 'foreignColumns') { fk.table = tableNameOf(el.childForFieldName('object')); fk.foreignColumns.push(prop); }
        }
      }
      if (fk.table) out.push(fk);
      return;
    }
  }
  for (let i = 0; i < node.namedChildCount; i++) collectForeignKeys(node.namedChild(i), out);
}

/** meta for `pgTable('sql_name', { columns }, extras)`. Shape gaps are named in `unresolved`. */
function tableMeta(builder, args) {
  const meta = { kind: 'table', dialect: TABLE_BUILDERS[builder], builder, sqlName: stringValue(args.namedChild(0)), columns: [], foreignKeys: [] };
  const cols = columnsObject(args.namedChild(1));
  const problems = [];
  if (!meta.sqlName) problems.push('table name is not a string literal');
  if (!cols) problems.push('columns argument is not an object literal');
  for (const child of cols ? cols.namedChildren : []) {
    if (child.type === 'pair') meta.columns.push(parseColumn(child.childForFieldName('key').text, child.childForFieldName('value')));
    else if (child.type === 'spread_element') meta.columns.push({ name: child.text, type: 'spread', unresolved: 'spread — columns defined elsewhere' });
  }
  collectForeignKeys(args.namedChild(2), meta.foreignKeys);
  for (const c of meta.columns) if (c.unresolved) problems.push(`column ${c.name}: ${c.unresolved}`);
  if (problems.length) meta.unresolved = problems;
  return meta;
}

function enumMeta(builder, args) {
  const values = args.namedChild(1);
  const meta = { kind: 'enum', dialect: ENUM_BUILDERS[builder], builder, sqlName: stringValue(args.namedChild(0)), values: [] };
  if (values && values.type === 'array') meta.values = values.namedChildren.map(stringValue).filter((v) => v !== null);
  const problems = [];
  if (!meta.sqlName) problems.push('enum name is not a string literal');
  if (!values || values.type !== 'array') problems.push('values argument is not an array literal');
  if (problems.length) meta.unresolved = problems;
  return meta;
}

/**
 * Names in this file that could be a table: imported names (local → exported
 * name), namespace imports (`import * as schema`), and tables declared here.
 */
function collectTableCandidates(rootNode) {
  const local = new Map();
  const namespaces = new Set();
  for (const stmt of rootNode.namedChildren) {
    if (stmt.type === 'import_statement') {
      const clause = stmt.namedChildren.find((c) => c.type === 'import_clause');
      for (const sub of clause ? clause.namedChildren : []) {
        if (sub.type === 'identifier') local.set(sub.text, sub.text);
        if (sub.type === 'namespace_import') { const id = sub.namedChildren.find((c) => c.type === 'identifier'); if (id) namespaces.add(id.text); }
        if (sub.type === 'named_imports') {
          for (const spec of sub.namedChildren) {
            const name = spec.childForFieldName('name');
            const alias = spec.childForFieldName('alias');
            if (name) local.set((alias || name).text, name.text);
          }
        }
      }
    }
    const decl = stmt.type === 'export_statement' ? stmt.childForFieldName('declaration') : stmt;
    if (decl && decl.type === 'lexical_declaration') {
      for (const d of decl.namedChildren) {
        const value = d.type === 'variable_declarator' ? d.childForFieldName('value') : null;
        const fn = value && value.type === 'call_expression' ? value.childForFieldName('function') : null;
        if (fn && (TABLE_BUILDERS[fn.text] || ENUM_BUILDERS[fn.text])) local.set(d.childForFieldName('name').text, d.childForFieldName('name').text);
      }
    }
  }
  return { local, namespaces };
}

/**
 * The table a call chain writes (`db.update(T).set().where(...)` → 'T'), or null.
 * A chain that reads (`.from(`) before any write is a subquery, not a write.
 */
function chainWriteTarget(call) {
  let n = call;
  while (n && n.type === 'call_expression') {
    const fn = n.childForFieldName('function');
    if (!fn || fn.type !== 'member_expression') return null;
    const prop = fn.childForFieldName('property').text;
    if (TABLE_READ_OPS.has(prop)) return null;
    if (TABLE_WRITE_OPS.has(prop)) {
      const args = n.childForFieldName('arguments');
      return args ? tableNameOf(args.namedChild(0)) : null;
    }
    n = unwrapParens(fn.childForFieldName('object'));
  }
  return null;
}

const SCOPE_BOUNDARY = /(_statement|_declaration|^arrow_function$|^function$|^function_expression$|^method_definition$|^statement_block$)/;

/**
 * Is this identifier a USE of the name? Not its declaration, an import/export
 * specifier, a parameter, a callee, or the receiver of a method call (`logger.info()`).
 */
function isUseSite(node) {
  const parent = node.parent;
  if (!parent) return false;
  if (NON_USE_PARENTS.has(parent.type)) return false;
  const same = (field) => { const f = parent.childForFieldName(field); return f !== null && f.startIndex === node.startIndex && f.type === node.type; };
  if (parent.type === 'variable_declarator' && same('name')) return false;
  if (parent.type === 'call_expression' && same('function')) return false;
  if (parent.type === 'new_expression' && same('constructor')) return false;
  if (parent.type === 'member_expression' && same('object')) {
    const grand = parent.parent;
    const callee = grand && grand.type === 'call_expression' ? grand.childForFieldName('function') : null;
    if (callee !== null && callee.startIndex === parent.startIndex) return false;
  }
  return true;
}

/**
 * A ref to table `name` is a WRITE only inside a chain that writes THAT table
 * (`db.update(T).where(eq(T.id, …))`). A ref to another table inside it
 * (`.values({ who: users.name })`, a `.from(users)` subquery) is a READ, and so
 * is `hash.update(users.id)`. The nearest enclosing chain decides.
 */
function refAccess(node, name) {
  for (let p = node.parent; p && !SCOPE_BOUNDARY.test(p.type); p = p.parent) {
    if (p.type !== 'call_expression') continue;
    const fn = p.childForFieldName('function');
    const prop = fn && fn.type === 'member_expression' ? fn.childForFieldName('property').text : null;
    if (prop !== null && TABLE_READ_OPS.has(prop)) return 'READ';
    const target = chainWriteTarget(p);
    if (target !== null) return target === name ? 'WRITE' : 'READ';
  }
  return 'READ';
}

// ── Python-specific extraction ────────────────────────────────────────────────

function walkPython(rootNode, relPath, entities, edges) {
  function walk(node, enclosingFuncId) {
    const t = node.type;

    if (t === 'import_statement') {
      // import foo, bar
      for (let i = 0; i < node.namedChildCount; i++) {
        const child = node.namedChild(i);
        if (child.type === 'dotted_name') {
          edges.push({
            kind: 'require',
            source: relPath,
            target: child.text.replace(/\./g, '/'),
            names: [],
            line: node.startPosition.row + 1,
          });
        }
      }
    } else if (t === 'import_from_statement') {
      // from foo import bar, baz   /   from .utils import x   /   from ..pkg.mod import y
      const moduleNode = node.childForFieldName('module_name');
      // Python relative imports use LEADING dots for package level: a single
      // leading '.' = the current package (the file's own directory), '..' = the
      // parent package, etc. A non-leading '.' is a submodule separator. The old
      // code did a blind dot→slash replace, so `from .utils` became `/utils` (a
      // bogus absolute id) instead of a './utils' relative specifier the query
      // layer can resolve to a real file id. Translate leading dots to '../' levels.
      let target = '?';
      if (moduleNode) {
        const raw = moduleNode.text; // e.g. '.utils', '..pkg.mod', 'django.db'
        const lead = raw.match(/^\.+/);
        if (lead) {
          const dots = lead[0].length;            // 1 = current pkg, 2 = parent, ...
          const rest = raw.slice(dots).replace(/\./g, '/'); // submodule dots → slashes
          // 1 dot → './rest'  ;  2 dots → '../rest'  ;  3 dots → '../../rest'
          const up = '../'.repeat(dots - 1);
          target = './' + up + rest;              // a relative specifier the query layer resolves
        } else {
          target = raw.replace(/\./g, '/');       // absolute/package import (e.g. django/db)
        }
      }
      const names = [];
      for (let i = 0; i < node.namedChildCount; i++) {
        const child = node.namedChild(i);
        if (child.type === 'dotted_name' && child !== moduleNode) names.push(child.text);
        if (child.type === 'import_list') {
          for (let j = 0; j < child.namedChildCount; j++) {
            names.push(child.namedChild(j).text);
          }
        }
      }
      edges.push({
        kind: 'import',
        source: relPath,
        target,
        names,
        line: node.startPosition.row + 1,
      });
    } else if (t === 'function_definition') {
      const nameNode = node.childForFieldName('name');
      if (nameNode) {
        const name = nameNode.text;
        const funcId = `${relPath}#${name}@${node.startPosition.row + 1}`;
        entities.push({
          id: funcId,
          name,
          type: 'function',
          line: node.startPosition.row + 1,
          endLine: node.endPosition.row + 1,
          exported: false,
        });
        // walk body with this funcId as enclosing
        const body = node.childForFieldName('body');
        if (body) {
          for (let i = 0; i < body.childCount; i++) {
            walk(body.child(i), funcId);
          }
        }
        return;
      }
    } else if (t === 'class_definition') {
      const nameNode = node.childForFieldName('name');
      if (nameNode) {
        const name = nameNode.text;
        entities.push({
          id: `${relPath}#${name}@${node.startPosition.row + 1}`,
          name,
          type: 'class',
          line: node.startPosition.row + 1,
          endLine: node.endPosition.row + 1,
          exported: false,
        });
        const body = node.childForFieldName('body');
        if (body) {
          for (let i = 0; i < body.childCount; i++) {
            walk(body.child(i), enclosingFuncId);
          }
        }
        return;
      }
    } else if (t === 'call') {
      // Python call node
      const fn = node.childForFieldName('function');
      if (fn && enclosingFuncId) {
        const calleeName = resolveCalleeName(fn) || fn.text;
        if (calleeName) {
          edges.push({
            kind: 'call-site',
            source: enclosingFuncId,
            target: `UNRESOLVED#${calleeName}`,
            line: node.startPosition.row + 1,
            col: fn.startPosition.column, // [RULE] scip-tier-proportional
          });
        }
      }
    }

    for (let i = 0; i < node.childCount; i++) {
      walk(node.child(i), enclosingFuncId);
    }
  }
  walk(rootNode, null);
}

// ── TypeScript / JavaScript extraction ───────────────────────────────────────

/**
 * Walk a TS/JS AST and extract entities + edges.
 *
 * Tracks the "enclosing function funcId" stack so call-site edges carry
 * a file-qualified source funcId per [RULE] who-calls-function-identity-disambiguated.
 */
function walkTSJS(rootNode, relPath, entities, edges) {
  // Drizzle table tracking — see "Drizzle database tables" above.
  const candidates = collectTableCandidates(rootNode);
  const consumed = new Set();     // startIndex of table args already recorded as an operation
  const declRanges = [];          // [start, end] of table declarations (FKs live in meta, not edges)
  const refSeen = new Set();      // one column-ref edge per (user, access, table)
  const inDecl = (i) => declRanges.some(([s, e]) => i >= s && i < e);
  const userOf = (enclosingFuncId) => (enclosingFuncId === null ? `${relPath}#_toplevel` : enclosingFuncId);
  const tableEdge = (access, src, name, op, node) => edges.push({
    kind: `TABLE-${access}`,
    source: src,
    target: `TABLE#${name}#${op}@${node.startPosition.row + 1}`,
    line: node.startPosition.row + 1,
  });
  /** The exported table name `node` refers to, when it is a candidate (`T`, `alias`, `schema.T`); else null. */
  function candidateName(node) {
    if (node.type === 'identifier') return candidates.local.has(node.text) ? candidates.local.get(node.text) : null;
    if (node.type !== 'member_expression') return null;
    const obj = node.childForFieldName('object');
    if (obj.type !== 'identifier' || !candidates.namespaces.has(obj.text)) return null;
    return node.childForFieldName('property').text;
  }
  function tableRef(node, name, enclosingFuncId) {
    if (consumed.has(node.startIndex)) return;
    if (inDecl(node.startIndex)) return;
    const src = userOf(enclosingFuncId);
    const access = refAccess(node, name);
    const key = `${src}\u0000${access}\u0000${name}`;
    if (refSeen.has(key)) return;
    refSeen.add(key);
    tableEdge(access, src, name, 'ref', node);
  }

  /**
   * @param {object} node  - tree-sitter ASTNode
   * @param {string|null} enclosingFuncId  - funcId of innermost function containing this node
   * @param {string|null} enclosingClass   - name of innermost class (for method parentClass)
   */
  function walk(node, enclosingFuncId, enclosingClass) {
    const t = node.type;

    // ── import_statement / import_declaration ─────────────────────────────
    if (t === 'import_statement' || t === 'import_declaration') {
      const sourceNode = node.childForFieldName('source');
      if (sourceNode) {
        const target = sourceNode.text.replace(/^['"`]|['"`]$/g, '');
        const names = extractImportedNames(node);
        edges.push({
          kind: 'import',
          source: relPath,
          target,
          names,
          line: node.startPosition.row + 1,
        });
      }
      return; // no children to recurse into for imports
    }

    // ── call_expression ───────────────────────────────────────────────────
    if (t === 'call_expression') {
      const fn = node.childForFieldName('function');
      const args = node.childForFieldName('arguments');

      // require('module')
      if (fn && fn.text === 'require') {
        if (args && args.namedChildCount > 0) {
          const first = args.namedChild(0);
          if (first && (first.type === 'string' || first.type === 'string_fragment')) {
            const target = first.text.replace(/^['"`]|['"`]$/g, '');
            edges.push({
              kind: 'require',
              source: relPath,
              target,
              names: [],
              line: node.startPosition.row + 1,
            });
          }
        }
      } else if (fn) {
        // General call-site edge — [RULE] who-calls-function-identity-disambiguated
        const calleeName = resolveCalleeName(fn);
        if (calleeName && calleeName !== 'require') {
          const srcId = enclosingFuncId || `${relPath}#_toplevel`;
          edges.push({
            kind: 'call-site',
            source: srcId,
            target: `UNRESOLVED#${calleeName}`,
            line: node.startPosition.row + 1,
            // callee column — lets the SCIP upgrader tell a call the compiler saw
            // from one it never looked at. [RULE] scip-tier-proportional
            col: fn.startPosition.column,
          });
        }

        // Table operation: `.from(T)`, `.innerJoin(T, …)`, `.insert(T)`, `.update(T)`, `.delete(T)`.
        // [RULE] drizzle-table-entity-and-usage-edges
        const op = fn.type === 'member_expression' ? fn.childForFieldName('property').text : null;
        const tableArg = op !== null && TABLE_OPS.has(op) && args ? unwrapParens(args.namedChild(0)) : null;
        const tableName = tableArg ? candidateName(tableArg) : null;
        if (tableName !== null) {
          tableEdge(TABLE_WRITE_OPS.has(op) ? 'WRITE' : 'READ', userOf(enclosingFuncId), tableName, op, fn.childForFieldName('property'));
          consumed.add(tableArg.startIndex);
          if (tableArg.type === 'member_expression') consumed.add(tableArg.childForFieldName('property').startIndex);
        }

        // Route registration: the route itself becomes the caller, named by
        // method + path + line — for its anonymous handler AND for every
        // middleware call in its arguments (`requireAuth()`, `requireLocationTenant()`).
        // Crediting middleware to the enclosing scope collapsed 95 routes into one
        // `_toplevel` caller per file. [RULE] anonymous-caller-synthesized-never-dropped
        // [RULE] route-middleware-args-credited-to-route
        const label = routeLabel(fn, args);
        const handlers = label ? args.namedChildren.filter(isAnonymousFn) : [];
        const middlewareCalls = label && isRoutePath(args.namedChild(0))
          ? args.namedChildren.slice(1).filter((a) => a.type === 'call_expression') : [];
        if (handlers.length || middlewareCalls.length) {
          const line = node.startPosition.row + 1;
          const routeId = `${relPath}#${label}@${line}`;
          entities.push({
            id: routeId,
            name: label,
            type: 'function',
            line,
            endLine: node.endPosition.row + 1,
            exported: false,
            synthetic: 'route-handler',
          });
          // Node objects are re-created per access, so match handlers by position.
          const handlerStarts = new Set(handlers.map((h) => h.startIndex));
          walk(fn, enclosingFuncId, enclosingClass);
          for (let i = 0; i < args.childCount; i++) {
            const arg = args.child(i);
            if (!handlerStarts.has(arg.startIndex) || !isAnonymousFn(arg)) { walk(arg, routeId, enclosingClass); continue; }
            for (let j = 0; j < arg.childCount; j++) walk(arg.child(j), routeId, enclosingClass);
          }
          return;
        }
      }

      // Fall through to walk children (the call_expression can contain more nodes)
    }

    // ── table references: `eq(T.id, …)`, `getTableColumns(T)`, `db.query.T.findMany()` ──
    // [RULE] drizzle-table-entity-and-usage-edges
    if (t === 'identifier' || t === 'shorthand_property_identifier') {
      if (candidates.local.has(node.text) && isUseSite(node)) tableRef(node, candidates.local.get(node.text), enclosingFuncId);
      return;
    }
    if (t === 'member_expression') {
      const obj = node.childForFieldName('object');
      const prop = node.childForFieldName('property');
      // Drizzle's relational API only: `<db>.query.<table>.findMany|findFirst(…)`.
      // `req.query.page` / `data.query?.pages` are not table reads.
      const outer = node.parent;
      const method = outer && outer.type === 'member_expression' ? outer.childForFieldName('property').text : null;
      const viaQuery = obj.type === 'member_expression' && obj.childForFieldName('property').text === 'query' &&
        (method === 'findMany' || method === 'findFirst');
      if (viaQuery && prop.type === 'property_identifier') {
        tableEdge('READ', userOf(enclosingFuncId), prop.text, 'query', node);
      } else if (obj.type === 'identifier' && candidates.namespaces.has(obj.text) && isUseSite(node)) {
        tableRef(node, prop.text, enclosingFuncId);
      }
    }

    // ── anonymous function with no named scope around it ─────────────────
    // Inside a named function, a callback's calls belong to that function
    // (enclosingFuncId passes through). Outside one, give it a located id.
    if (!enclosingFuncId && isAnonymousFn(node)) {
      const anonId = `${relPath}#anonymous@${node.startPosition.row + 1}`;
      for (let i = 0; i < node.childCount; i++) walk(node.child(i), anonId, enclosingClass);
      return;
    }

    // ── function_declaration ──────────────────────────────────────────────
    if (t === 'function_declaration' || t === 'function') {
      const nameNode = node.childForFieldName('name');
      if (nameNode) {
        const name = nameNode.text;
        const funcId = `${relPath}#${name}@${node.startPosition.row + 1}`;
        entities.push({
          id: funcId,
          name,
          type: enclosingClass ? 'method' : 'function',
          line: node.startPosition.row + 1,
          endLine: node.endPosition.row + 1,
          exported: isExportedNode(node),
          ...(enclosingClass ? { parentClass: enclosingClass } : {}),
        });
        // Walk body with this funcId
        for (let i = 0; i < node.childCount; i++) {
          walk(node.child(i), funcId, enclosingClass);
        }
        return;
      }
    }

    // ── method_definition ─────────────────────────────────────────────────
    if (t === 'method_definition') {
      const nameNode = node.childForFieldName('name');
      if (nameNode && nameNode.text !== 'constructor') {
        const name = nameNode.text;
        const funcId = `${relPath}#${name}@${node.startPosition.row + 1}`;
        entities.push({
          id: funcId,
          name,
          type: 'method',
          line: node.startPosition.row + 1,
          endLine: node.endPosition.row + 1,
          exported: true, // methods are implicitly exported via their class
          parentClass: enclosingClass || undefined,
        });
        for (let i = 0; i < node.childCount; i++) {
          walk(node.child(i), funcId, enclosingClass);
        }
        return;
      }
    }

    // ── class_declaration / class ─────────────────────────────────────────
    if (t === 'class_declaration' || t === 'class') {
      const nameNode = node.childForFieldName('name');
      if (nameNode) {
        const name = nameNode.text;
        entities.push({
          id: `${relPath}#${name}@${node.startPosition.row + 1}`,
          name,
          type: 'class',
          line: node.startPosition.row + 1,
          endLine: node.endPosition.row + 1,
          exported: isExportedNode(node),
        });
        // Walk children with class context
        for (let i = 0; i < node.childCount; i++) {
          walk(node.child(i), enclosingFuncId, name);
        }
        return;
      }
    }

    // ── lexical_declaration / variable_declaration ────────────────────────
    // const foo = () => ... or const foo = function...
    if (t === 'lexical_declaration' || t === 'variable_declaration') {
      const isExp = isExportedNode(node);
      const walkedValues = new Set(); // bodies already walked under their own funcId
      for (let i = 0; i < node.namedChildCount; i++) {
        const decl = node.namedChild(i);
        if (decl.type === 'variable_declarator') {
          const nameNode = decl.childForFieldName('name');
          const valueNode = decl.childForFieldName('value');
          if (nameNode && valueNode &&
              (valueNode.type === 'arrow_function' ||
               valueNode.type === 'function' ||
               valueNode.type === 'function_expression')) {
            const name = nameNode.text;
            const funcId = `${relPath}#${name}@${decl.startPosition.row + 1}`;
            entities.push({
              id: funcId,
              name,
              type: 'function',
              line: decl.startPosition.row + 1,
              endLine: valueNode.endPosition.row + 1,
              exported: isExp,
            });
            // Walk arrow/function body with this funcId
            for (let j = 0; j < valueNode.childCount; j++) {
              walk(valueNode.child(j), funcId, enclosingClass);
            }
            walkedValues.add(valueNode.startIndex);
          } else if (nameNode && valueNode && valueNode.type === 'call_expression') {
            // `const scheduleEvents = pgTable('schedule_events', {...})` → table entity.
            // [RULE] drizzle-table-entity-and-usage-edges
            const builder = valueNode.childForFieldName('function').text;
            const args = valueNode.childForFieldName('arguments');
            const isTable = Object.prototype.hasOwnProperty.call(TABLE_BUILDERS, builder);
            const isEnum = Object.prototype.hasOwnProperty.call(ENUM_BUILDERS, builder);
            if (args && (isTable || isEnum)) {
              const meta = isTable ? tableMeta(builder, args) : enumMeta(builder, args);
              entities.push({
                id: `${relPath}#${nameNode.text}@${decl.startPosition.row + 1}`,
                name: nameNode.text,
                type: meta.kind,
                line: decl.startPosition.row + 1,
                endLine: valueNode.endPosition.row + 1,
                exported: isExp,
                meta,
              });
              declRanges.push([valueNode.startIndex, valueNode.endIndex]);
            }
          }
        }
      }
      // Walk the rest of the declaration, but NOT a function body already walked
      // above — walking it again credited each of its calls to a second, wrong
      // caller (_toplevel). [RULE] anonymous-caller-synthesized-never-dropped
      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (child.type !== 'variable_declarator') { walk(child, enclosingFuncId, enclosingClass); continue; }
        for (let j = 0; j < child.childCount; j++) {
          const part = child.child(j);
          if (walkedValues.has(part.startIndex) && part.type !== 'identifier') continue;
          walk(part, enclosingFuncId, enclosingClass);
        }
      }
      return;
    }

    // ── export_statement (bare re-exports: export { x, y }) ──────────────
    if (t === 'export_statement') {
      const declaration = node.childForFieldName('declaration');
      if (!declaration) {
        // export { x, y as z }
        for (let i = 0; i < node.namedChildCount; i++) {
          const child = node.namedChild(i);
          if (child.type === 'export_clause') {
            for (let j = 0; j < child.namedChildCount; j++) {
              const spec = child.namedChild(j);
              // export_specifier has field "name" (local name) and optional "alias"
              const nameNode = spec.childForFieldName('name') || spec;
              if (nameNode) {
                entities.push({
                  id: `${relPath}#export:${nameNode.text}`,
                  name: nameNode.text,
                  type: 'export',
                  line: node.startPosition.row + 1,
                  exported: true,
                });
              }
            }
          }
        }
      }
      // Re-export from another file: export { x } from './foo'
      const sourceNode = node.childForFieldName('source');
      if (sourceNode) {
        const target = sourceNode.text.replace(/^['"`]|['"`]$/g, '');
        edges.push({
          kind: 'import',
          source: relPath,
          target,
          names: [],
          line: node.startPosition.row + 1,
        });
      }
    }

    // ── Walk children ─────────────────────────────────────────────────────
    for (let i = 0; i < node.childCount; i++) {
      walk(node.child(i), enclosingFuncId, enclosingClass);
    }
  }

  walk(rootNode, null, null);
}

// ── Per-file extraction (exported API) ───────────────────────────────────────

/**
 * Extract entities + edges from a single source file.
 *
 * @param {string} absPath  - absolute path to the file
 * @param {string} relPath  - repo-relative POSIX path (the file's identity in the store)
 * @returns {{ file: string, entities: Array, edges: Array, loc: number }}
 *
 * Per graph-parser-floor-contract.md §Per-file parse output shape.
 */
function extractEdges(absPath, relPath) {
  ensureParsers();

  const ext = path.extname(absPath).toLowerCase();
  const content = fs.readFileSync(absPath, 'utf8');
  const loc = content.split('\n').length;

  const grammar = getGrammar(ext);
  if (!grammar) {
    // Unsupported extension or parsers not available — return empty (no crash)
    return { file: relPath, entities: [], edges: [], loc };
  }

  const entities = [];
  const edges = [];

  const parser = new Parser();
  parser.setLanguage(grammar);
  // tree-sitter 0.21's Node binding defaults to a 32 KB parse buffer and throws
  // "Invalid argument" on larger source — silently dropping every file over
  // ~32 KB (common in real repos: Atos has many). Pass an explicit bufferSize
  // sized to the content (+ headroom) so large files index correctly.
  const tree = parser.parse(content, null, {
    bufferSize: Math.max(32 * 1024, content.length * 2 + 1024),
  });

  if (ext === '.py') {
    walkPython(tree.rootNode, relPath, entities, edges);
  } else {
    walkTSJS(tree.rootNode, relPath, entities, edges);
  }

  return { file: relPath, entities, edges, loc };
}

// ── CLI entry point ──────────────────────────────────────────────────────────

if (require.main === module) {
  const args = process.argv.slice(2);
  const fileArg = args.find(a => !a.startsWith('--'));
  const rootIdx = args.indexOf('--repo-root');
  const repoRoot = rootIdx !== -1 ? args[rootIdx + 1] : process.cwd();

  if (!fileArg) {
    errLog('Usage: gsd-t-graph-edge-extract.cjs <file> [--repo-root <root>]');
    process.exit(1);
  }

  const absPath = path.resolve(fileArg);
  if (!fs.existsSync(absPath)) {
    const envelope = { ok: false, error: 'file-not-found', file: fileArg };
    console.log(JSON.stringify(envelope, null, 2));
    process.exit(1);
  }

  const ext = path.extname(absPath).toLowerCase();
  if (!PARSED_EXTS.has(ext)) {
    const envelope = {
      ok: false,
      error: 'unsupported-extension',
      file: fileArg,
      ext,
      supported: [...PARSED_EXTS],
    };
    console.log(JSON.stringify(envelope, null, 2));
    process.exit(1);
  }

  const relPath = path.relative(repoRoot, absPath).split(path.sep).join('/');
  info(`Extracting edges from: ${relPath}`);

  const result = extractEdges(absPath, relPath);

  const envelope = {
    ok: true,
    file: result.file,
    loc: result.loc,
    entityCount: result.entities.length,
    edgeCount: result.edges.length,
    entities: result.entities,
    edges: result.edges,
  };
  console.log(JSON.stringify(envelope, null, 2));
  process.exit(0);
}

module.exports = { extractEdges, PARSED_EXTS };
