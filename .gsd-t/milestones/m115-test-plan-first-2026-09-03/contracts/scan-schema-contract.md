# Contract: scan-schema

**Owner**: scan-schema domain (`bin/scan-schema.js`)
**Consumers**: scan-diagrams domain (`bin/scan-diagrams.js`)

## Function Signature

```js
/**
 * Scan a project root directory for ORM/schema definitions.
 * @param {string} projectRoot - Absolute path to the project being scanned
 * @returns {SchemaData}
 */
function extractSchema(projectRoot)
```

## Output Shape: SchemaData

```js
{
  detected: boolean,          // true if any ORM/schema files were found
  ormType: string | null,     // 'typeorm' | 'prisma' | 'drizzle' | 'mongoose' | 'sequelize' | 'sqlalchemy' | 'raw-sql' | null
  entities: Entity[],         // array of detected entities/models/tables
  parseWarnings: string[]     // non-fatal parse issues (e.g. "Could not fully parse foo.entity.ts")
}
```

### Entity Shape

```js
{
  name: string,               // entity/table name (PascalCase for ORM, snake_case for SQL)
  fields: Field[],            // columns/properties
  primaryKey: string | null,  // field name that is the PK (null if not detectable)
  relations: Relation[]       // foreign key / association relationships
}
```

### Field Shape

```js
{
  name: string,               // field/column name
  type: string,               // data type as a string (e.g. 'varchar(255)', 'int', 'boolean', 'text')
  nullable: boolean,          // true if field is optional/nullable
  unique: boolean             // true if field has unique constraint
}
```

### Relation Shape

```js
{
  type: 'one-to-one' | 'one-to-many' | 'many-to-one' | 'many-to-many',
  fromEntity: string,         // source entity name
  toEntity: string,           // target entity name
  throughTable: string | null // join table name for many-to-many (null otherwise)
}
```

## Contract Rules

1. `extractSchema` NEVER throws — all errors are caught and surfaced in `parseWarnings`
2. If no ORM/schema files are detected, returns `{ detected: false, ormType: null, entities: [], parseWarnings: [] }`
3. Only ONE ormType is returned even if multiple ORMs are present — highest-confidence detection wins
4. `entities` array may be empty if detection succeeded but parsing yielded no entities
5. All string values are trimmed; names are never empty strings
6. Relations are best-effort — scan-diagrams must handle empty `relations` arrays gracefully

## Breaking Change Policy

Any change to this contract shape (new required fields, renamed fields, changed types) requires:
1. Update this file
2. Update scan-schema domain's `bin/scan-schema.js`
3. Update scan-diagrams domain's `bin/scan-diagrams.js` (consumer)
4. Version bump in progress.md Decision Log
