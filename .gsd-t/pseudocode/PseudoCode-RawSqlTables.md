# Raw SQL Tables

The code graph learns the database tables a project writes in plain SQL, and which functions read or write each one, including SQL whose table name arrives in a variable.

```text
The graph build reads a project file
  What kind of file is it:
    A SQL file: Read every statement in it
    A code file (JavaScript, TypeScript, Python): Read every piece of quoted text in it, looking for SQL
      Text joined from pieces counts as one piece of SQL (pieces added together, a list joined, Python's fill-in slots)
    Anything else: Skip it, as today

  For each SQL statement found
    Does it create or change a table (create a table, add or drop a column):
      Yes: Record that this line declares the table, with the columns it adds or drops
      No:  Carry on
    Does it read or write a table:
      Reading means it pulls rows from the table or joins it in
      Writing means it inserts, updates, deletes, empties or bulk-loads rows
      Is the table name written out in the text:
        Yes: Record a use, credited to the block of code that holds the text
        No (the name comes from a variable): Note where the variable comes from, to trace once every file is read
        No (the text stops where the name goes, or a placeholder stands there): Is it a write:
          Yes: List the line as a write to an unknown table, with the reason, never skip it
          No:  Carry on
      Does the statement run another piece of text as SQL (a database function running a quoted statement):
        Yes: Read that text as SQL too
        No:  Carry on

  Does this line hand values to another block of code:
    Yes: Keep any plain text it passes along, by argument position, for tracing later
    No:  Carry on

Every file is read
  Merge the declarations by table name, ignoring letter case
    Does a table defined in code with Drizzle (a library that declares tables in code) already have this name:
      Yes: Add these lines to it as more places it is declared
           Its Drizzle columns stay the truth, since the migration files are only its history
      No:  Make one table for the name
           Its columns are every column any declaration added
           Do two declarations give one column different types:
             Yes: Name the clash on the table, never pick one quietly
             No:  Carry on
           Was a column dropped somewhere:
             Yes: Mark it dropped, and say where
             No:  Carry on

  Trace each variable table name back to where it is written out
    Follow every part of the value: both sides of a choice, every item of a list, every value the variable is later given
    Is it looping over a list written in the same block of code or file:
      Yes: Each table name in that list is used here
    Is it a value handed in by whoever calls this code:
      Yes: Look at every caller the graph knows of
        Does the caller hand in the name as plain text (alone or inside a list of records):
          Yes: That table is used here, reached through this caller
          No:  Trace the caller's own value back the same way
        Does some caller hand in nothing that can be traced:
          Yes: Mark the line as choosing its table while running for that caller, alongside what the other callers give
        Is there no caller at all:
          Yes: Mark the line as having no caller to supply a table
    Is it the list some other block of code hands back:
      Yes: Each table name in that list is used here
    Did it come from somewhere untraceable (a web request, the database, a setting):
      Mark the line as choosing its table while running, never guess

  Keep only uses that name a known table
    Every other match is noise, like the "from" in "take the year from a date"

Someone asks who uses a table
  Show every block of code that reads or writes it, read or write labelled
  For a use found by tracing, also show which caller supplied the name
  Show how many lines in the project choose their table while running, and where they are

Someone asks about one table
  Show its columns, the links to other tables in both directions, and every place it is declared

Someone asks what a change to some code could break
  Show everything that calls or imports it, as today
  Does that code write to a table:
    Yes: Also show the code elsewhere that reads that table, in its own section
    No:  Add nothing, since reading a table changes nothing for anyone else

The codebase scan reviews one slice
  Tell the reviewer it can ask who reads or writes a table, and what a table holds
  For each table the slice writes, have it check that writers and readers elsewhere agree
```

---

## What it does today

```text
The graph build reads a project file
  Is it JavaScript, TypeScript or Python:
    Yes: Parse it
    No:  Skip it, so a SQL file is never opened
  Is something a Drizzle table declaration:
    Yes: Record it as a table, with its columns
    No:  Carry on
  Is something a Drizzle call that reads or writes a table:
    Yes: Record a use
    No:  Carry on, so SQL written inside quoted text is never seen

Someone asks who uses a table in a project with no Drizzle
  No table is known
  Answer "not found"
```

It got this way because the first table support was built for Hilo, which uses Drizzle. TimeTracking talks to Postgres with plain SQL, so the graph finds zero tables there and every table question dead-ends.

## What changes

```text
The build also reads SQL files, and the quoted text in code files
SQL found anywhere declares tables and records uses
A table named by a variable is traced back to where its name is written out
The answers to "who uses" and "this table" work for plain SQL projects
A Drizzle project gains its raw SQL uses, and its migration files attach to the tables it already has
Blast radius also follows data: code that writes a table reaches the code that reads it
The codebase scan is told to ask the graph about tables
```

## The rules

- [RULE] raw-sql-table-one-per-name — one table per SQL name (case ignored), merged across every declaration site; a Drizzle declaration of the same name owns it and raw declarations attach as extra sites.
- [RULE] raw-sql-use-credited-to-holder — a SQL use is credited to the function whose body holds the SQL text, not the function that sends it to the database.
- [RULE] variable-table-name-traced-never-guessed — a table name in a variable is traced to plain text (same-function list, every caller's argument, another function's returned list); whatever can't be traced is listed by file and line as choosing its table while running.
- [RULE] table-uses-filtered-to-known-tables — only uses naming a declared table are kept (existing rule, now covering raw SQL too).
- [RULE] graph-respects-gitignore — unchanged; built bundles stay out.
- [RULE] no-fallback — a SQL file that can't be read halts the build loudly with the file name; a statement shape the reader doesn't know is named in the table's unresolved list, never skipped quietly.
- [RULE] drizzle-table-entity-and-usage-edges — unchanged for Drizzle code.
- [RULE] blast-radius-follows-table-writes — blast radius of code adds the readers of every table that code itself writes, as a separate section; a read adds nothing.

## What I confirmed with you

- One table per SQL name: TimeTracking declares `tb_designations` in three places (the base schema, a migration, a test-setup mirror); they merge into one with all three sites listed.
- Drizzle tables stay the truth: Hilo's 462 generated migration files attach to the Drizzle tables rather than making duplicates. One generic rule, no per-tool folder list, so Prisma migrations (elearning-ai) work the same way.
- Variable table names must be traced to real edges, not left as notes: the delete guard, audit snapshots and test-data cleanup touch real tables, and a "who uses" answer that missed them would let a column rename break user deletion.
- Two more parts, asked for after the plan: blast radius follows table writes, and the scan prompts name the table questions.
- The five standing rules (no fallback, gitignore respected, case-insensitive table names, uses filtered to known tables, new bin tools registered) stand.

## Why this shape

- **Objective.** Make "who reads or writes this table" and "what is this table" answerable from the graph in projects that write plain SQL, so a schema change finds every place it touches.
- **Conflict.** None with Drizzle: the Drizzle declaration wins a shared name, and its existing edges are unchanged.
- **Reuse.** The table entity, the use edges, the read/write labels, the query verbs and the filter to known tables all exist; raw SQL feeds the same shapes. Tracing a value to callers reuses the graph's compiler-resolved call edges (370 of 379 TimeTracking files are compiler-resolved).
- **Simplicity.** A keyword scanner, not a full SQL parser: SQL in code is often a fragment or holds inserted values, which a full parser rejects. The scanner only needs a table name after a small, fixed set of SQL words, and the filter to known tables removes its noise. Tracing keeps only literal strings that equal a known table name, so a list of records like a table name plus a column name needs no special handling.
- **Duplication.** The Drizzle reader stays as it is; raw SQL is a second source feeding the same table store, not a copy of it.
- **Risk.** Read-only analysis; no user data touched. Hilo gains about 468 more files to read, so the build is measured before and after there. A guessed use would mislead a schema change, so tracing records only names written out as plain text.
- **No fallback.** An unreadable SQL file halts the build with its name. An untraceable variable is listed, not dropped.
- **Verification.** On TimeTracking: 25 tables found (22 in the base schema, 3 in the sign-in schema file); `who-uses tb_leave` lists the user-delete route through the delete guard (`index.ts:3590`); `who-uses tb_users --writes` lists the test-data cleanup route; the six schema-pattern test lines produce no uses; the ownership check reports no caller. On Hilo: the table count stays 435 tables and 65 enums, with migrations attached as sites, and existing Drizzle answers are unchanged.

## Where it lives

- `bin/gsd-t-graph-sql-scan.cjs` (new) — statement scanner: comments and quoted values stripped, statements split, declarations (`CREATE TABLE`, `ALTER TABLE … ADD|DROP COLUMN`, inline `REFERENCES`, `FOREIGN KEY`) and uses (`FROM`, `JOIN`, `INSERT INTO`, `UPDATE`, `DELETE FROM`, `MERGE INTO`, `TRUNCATE`) with line numbers; a `${…}` hole where a table name goes is reported as a variable site. Add to `PROJECT_BIN_TOOLS` / `GLOBAL_BIN_TOOLS` in `bin/gsd-t.js`.
- `bin/gsd-t-graph-edge-extract.cjs` — walk `string` / `template_string` nodes (JS/TS/Python), run the scanner, emit `table` entities with `meta.dialect: 'sql'` and `TABLE-READ` / `TABLE-WRITE` edges keyed `TABLE#sql:<name>#<op>@<line>`; for a variable site emit a pending edge naming its source (same-function literal list, parameter position, or callee return); record literal string arguments per call-site edge.
- `bin/gsd-t-graph-index.cjs` — add `.sql` to the enumerated extensions (scanner path, no tree-sitter / SCIP); `.sql` files count in the files table and status.
- `bin/gsd-t-graph-freshness.cjs` — `TRACKED_EXTS` gains `.sql`.
- `bin/gsd-t-graph-query-cli.cjs` — merge raw table entities by lowercased SQL name (attach to a Drizzle entity with that `sqlName`); `queryWhoUses` adds `sql:<sqlName>` uses and resolved variable uses (with `via` caller); `status` and `who-uses` report runtime-chosen sites; `table` lists `declaredAt`.
- `bin/gsd-t-code-search-classifier.cjs` / the search guard message — `.sql` is no longer "not indexed" for table questions; route `CREATE TABLE` / table-name searches to `table` / `who-uses`.
- Contracts: `graph-parser-floor-contract.md`, `graph-store-schema-contract.md`, `graph-indexer-build-contract.md`, `graph-freshness-contract.md`, `graph-query-cli-contract.md`.
- Tests: `test/graph-raw-sql-tables.test.js` + fixture `test/fixtures/raw-sql-graph/` (a `.sql` schema, a TS schema string, duplicates, a Drizzle + migration pair, each of the four variable-name sources, an untraceable request-supplied name, and a regex-only test line).
