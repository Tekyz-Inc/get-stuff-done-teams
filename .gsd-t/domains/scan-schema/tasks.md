# Tasks: scan-schema

**Domain**: scan-schema
**Wave**: Wave 1 (parallel-safe with scan-diagrams)
**Output**: `bin/scan-schema.js` — exports `extractSchema(projectRoot)`
**Contract**: `.gsd-t/contracts/scan-schema-contract.md`

---

## Task 1 — Create bin/scan-schema.js: module skeleton + ORM detection

**File**: `bin/scan-schema.js` (create new)

Implement the module skeleton and ORM detection logic:

- Require only `fs` and `path` (Node.js built-ins)
- Implement `findFiles(dir, suffix)` — synchronous recursive directory walk using `fs.readdirSync`, returns array of absolute paths whose filename ends with `suffix`; wrap in try/catch, return `[]` on error
- Implement `fileContains(filePath, substring)` — reads file content via `fs.readFileSync`, returns true if content includes substring; catch → false
- Implement `detectOrm(projectRoot)` — checks for ORM signals in priority order, returns `{ ormType, files }`:
  1. `prisma/schema.prisma` exists → `{ ormType: 'prisma', files: [path] }`
  2. `*.entity.ts` files exist AND any contains `@Entity()` → `{ ormType: 'typeorm', files }`
  3. `schema.ts` / `*.schema.ts` files exist AND any contains `drizzle-orm` → `{ ormType: 'drizzle', files }`
  4. `*.model.ts` / `*.schema.ts` files exist AND any contains `mongoose.Schema` → `{ ormType: 'mongoose', files }`
  5. `*.model.js` / `*.model.ts` files exist AND any contains `DataTypes` AND `Model.init` → `{ ormType: 'sequelize', files }`
  6. `models.py` / `*.model.py` files exist AND any contains `declarative_base` → `{ ormType: 'sqlalchemy', files }`
  7. `migrations/*.sql` files exist AND any contains `CREATE TABLE` → `{ ormType: 'raw-sql', files }`
  8. No match → `{ ormType: null, files: [] }`
- All file system calls wrapped in try/catch; errors silently skipped (never throw)
- `module.exports = { extractSchema }` at bottom of file (stub `extractSchema` returns empty schema until Task 4)

**Acceptance**: `node -e "const m = require('./bin/scan-schema.js'); console.log(typeof m.extractSchema)"` prints `'function'`

---

## Task 2 — Implement Prisma + TypeORM + Drizzle parsers (bin/scan-schema.js or bin/scan-schema-parsers.js)

**File**: `bin/scan-schema.js` (extend); extract to `bin/scan-schema-parsers.js` if file would exceed 200 lines

**parsePrisma(filePath, warnings)**:
- Read file content; extract `model ModelName { ... }` blocks with `/model\s+(\w+)\s*\{([^}]+)\}/g`
- Per block: split body by newlines; per non-empty line extract field name (first token) and type (second token); strip `?` suffix → `nullable: true`; strip `[]` suffix for array types
- Detect `@id` on a line → set `primaryKey` to that field name
- Detect `@unique` → `unique: true`
- Detect relation fields (type references another model and has `@relation`) → push to `relations[]` with type derived from `[]` suffix (`one-to-many` if array, `many-to-one` if not)
- Return `Entity[]`; push parse issues to `warnings` array

**parseTypeOrm(files, warnings)**:
- For each `*.entity.ts` file: read content
- Extract class name: `/export class (\w+)/`
- Find `@PrimaryGeneratedColumn|@PrimaryColumn` lines → next non-decorator line's property name is PK
- Find `@Column` decorated properties → extract name and TypeScript type annotation `:\s*(\w+)`
- Find `@ManyToOne|@OneToMany|@ManyToMany|@OneToOne` → extract target from lambda `() => (\w+)`; map decorator name to relation type enum value
- Return `Entity[]`; push issues to `warnings`

**parseDrizzle(files, warnings)**:
- For each file: read content; extract table declarations `pgTable|mysqlTable|sqliteTable\('(\w+)'`
- Extract column definitions: `(\w+):\s*\w+\(` → field name is key
- Detect `.primaryKey()` on a column chain → primaryKey field; detect `.notNull()` absence → `nullable: true`
- Return `Entity[]`; push issues to `warnings`

All parsers: functions under 30 lines each; all file reads in try/catch.

**Acceptance**: `parsePrisma` called with a temp file containing `model User { id Int @id\n  name String }` returns array with one entity named `User`.

---

## Task 3 — Implement Mongoose, Sequelize, SQLAlchemy, Raw SQL parsers

**File**: `bin/scan-schema.js` or `bin/scan-schema-parsers.js` (extend)

**parseMongoose(files, warnings)**:
- For each file: read content; extract schema body from `/new\s+Schema\s*\(\s*\{([^}]+)\}/`
- Per field line: extract `fieldName:` key; detect `type:\s*(\w+)` value
- Extract `ref: '(\w+)'` patterns as `many-to-one` relations (target = ref value)
- Return `Entity[]`

**parseSequelize(files, warnings)**:
- For each file containing `Model.init` and `DataTypes`: extract model class name from `class (\w+) extends Model`
- Extract columns from `Model.init({ colName: { type: DataTypes\.(\w+)` — field name is key, type is `DataTypes.X`
- Detect `primaryKey: true` in column options
- Return `Entity[]`

**parseSqlAlchemy(files, warnings)**:
- For each file: extract `class (\w+)\s*\(\w*Base\w*\):` → entity name
- Extract `(\w+)\s*=\s*Column\((\w+)` lines → field name and type
- Detect `primary_key=True`, `nullable=False` options
- Return `Entity[]`

**parseRawSql(files, warnings)**:
- For each `.sql` file: extract `CREATE TABLE\s+(\w+)\s*\(([^;]+)\)` blocks
- Per column line: field name (first token), type (second token), detect `PRIMARY KEY`, `NOT NULL`, `UNIQUE` keywords
- Return `Entity[]`

All parsers: functions under 30 lines each; all reads in try/catch; push errors to `warnings`.

**Acceptance**: `parseRawSql` with synthetic SQL content containing one `CREATE TABLE` returns one Entity without throwing.

---

## Task 4 — Wire extractSchema() top-level function + validate contract compliance

**File**: `bin/scan-schema.js` (finalize)

Implement the exported `extractSchema(projectRoot)` function body:

```
extractSchema(projectRoot):
  1. Outer try/catch — on catastrophic error return { detected: false, ormType: null, entities: [], parseWarnings: ['Fatal: ' + err.message] }
  2. Call detectOrm(projectRoot) → { ormType, files }
  3. If ormType is null → return { detected: false, ormType: null, entities: [], parseWarnings: [] }
  4. Declare warnings = []
  5. Dispatch to correct parser based on ormType (pass files and warnings)
  6. Trim all entity/field name strings; filter entries with empty names
  7. Return { detected: true, ormType, entities, parseWarnings: warnings }
```

Verify contract compliance:
- Return shape matches `scan-schema-contract.md` (all 4 top-level fields present)
- Entity: `name`, `fields`, `primaryKey`, `relations` all present
- Field: `name`, `type`, `nullable`, `unique` all present with correct types
- Relation: `type` (enum), `fromEntity`, `toEntity`, `throughTable` all present
- `module.exports = { extractSchema }` confirmed at bottom of file

**Acceptance**: `node -e "const {extractSchema} = require('./bin/scan-schema.js'); const r = extractSchema('/nonexistent'); console.log(r.detected)"` prints `false` without throwing.

---

## Task 5 — Test: verify scan-schema module correctness

Verify the following (node one-liners or inline assertions):

1. **Module loads**: `node -e "require('./bin/scan-schema.js')"` exits cleanly
2. **Export present**: `extractSchema` is exported and is a function
3. **Empty dir returns empty schema**: `extractSchema('/tmp')` returns `{ detected: false, ormType: null, entities: [], parseWarnings: [] }`
4. **Nonexistent path no throw**: `extractSchema('/nonexistent/xyz')` returns `{ detected: false, ... }` without throwing
5. **Prisma detection**: Temp dir with `prisma/schema.prisma` containing `model User { id Int @id\n  name String }` → `extractSchema(tmpDir)` returns `detected: true, ormType: 'prisma'`, entity `User` with field `id` having `primaryKey: 'id'`
6. **Raw SQL detection**: Temp dir with `migrations/001.sql` containing `CREATE TABLE orders (id INT PRIMARY KEY, user_id INT NOT NULL)` → `extractSchema(tmpDir)` returns `detected: true, ormType: 'raw-sql'`, entity `orders` with `id` as primaryKey
7. **Contract shape complete**: Returned object has all required fields; each entity has `name`, `fields`, `primaryKey`, `relations`

All 7 checks must pass before this domain is considered complete.

**Dependencies**: Tasks 1–4 complete.
