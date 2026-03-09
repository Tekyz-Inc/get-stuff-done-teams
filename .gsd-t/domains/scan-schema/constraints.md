# Constraints: scan-schema

## Must Follow
- Zero external npm dependencies (TECH-001) — use only Node.js built-ins (fs, path, os)
- Node.js >= 16 compatibility (TECH-002)
- Cross-platform paths — use `path.join` everywhere, never string concatenation
- Functions under 30 lines; files under 200 lines (split to scan-schema-parsers.js if needed)
- Schema extraction must add no more than 10% to total scan duration (NFR-009)
- Output must conform exactly to the scan-schema-contract.md shape

## Must Not
- Modify files outside owned scope (see scope.md)
- Install or require any npm packages — all parsing is regex/AST-free text analysis
- Block on network I/O — schema extraction is filesystem-only
- Throw uncaught exceptions — all parse errors are caught and result in partial data with a warning flag

## External References
- `scan-report-mock.html` — INSPECT only. Read the ER diagram section for visual reference. Do NOT copy code.
- `commands/gsd-t-scan.md` — Must Read Before Using. Read the full file to understand how scan-schema.js is called before writing the integration.

## Must Read Before Using
- `commands/gsd-t-scan.md` — understand the existing scan pipeline and where schema extraction hooks in (after Step 2, before Step 3)
- `.gsd-t/contracts/scan-schema-contract.md` — output shape this domain must produce

## Dependencies
- Depends on: nothing (scan-schema is the foundation layer)
- Depended on by: scan-diagrams for ER diagram (.mmd) generation

## ORM Detection Locked Dispositions
- TypeORM `@Entity()` + `*.entity.ts` → USE (regex detect, text parse)
- Prisma `prisma/schema.prisma` → USE (text parse — Prisma schema DSL)
- Drizzle `drizzle-orm` import + `schema.ts` → USE (regex detect, text parse)
- Mongoose `mongoose.Schema` + `*.model.ts` → USE (regex detect, text parse)
- Sequelize `DataTypes` + `Model.init` → USE (regex detect, text parse)
- SQLAlchemy `declarative_base` + `models.py` → USE (regex detect, text parse)
- Raw SQL `CREATE TABLE` in `migrations/*.sql` → USE (SQL DDL regex parse)
