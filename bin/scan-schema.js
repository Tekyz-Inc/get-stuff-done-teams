'use strict';
const fs = require('fs');
const path = require('path');
const parsers = require('./scan-schema-parsers');

function findFiles(dir, suffix) {
  try {
    const results = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules') {
        results.push(...findFiles(full, suffix));
      } else if (e.isFile() && e.name.endsWith(suffix)) {
        results.push(full);
      }
    }
    return results;
  } catch { return []; }
}

function fileContains(filePath, substring) {
  try { return fs.readFileSync(filePath, 'utf8').includes(substring); }
  catch { return false; }
}

function detectOrm(projectRoot) {
  try {
    const prisma = path.join(projectRoot, 'prisma', 'schema.prisma');
    if (fs.existsSync(prisma)) return { ormType: 'prisma', files: [prisma] };

    const entityFiles = findFiles(projectRoot, '.entity.ts').filter(f => fileContains(f, '@Entity'));
    if (entityFiles.length) return { ormType: 'typeorm', files: entityFiles };

    const drizzleFiles = findFiles(projectRoot, '.ts').filter(f => f.endsWith('schema.ts') && fileContains(f, 'drizzle-orm'));
    if (drizzleFiles.length) return { ormType: 'drizzle', files: drizzleFiles };

    const mongooseFiles = findFiles(projectRoot, '.ts').filter(f => fileContains(f, 'mongoose.Schema'));
    if (mongooseFiles.length) return { ormType: 'mongoose', files: mongooseFiles };

    const seqFiles = findFiles(projectRoot, '.ts').filter(f => fileContains(f, 'DataTypes') && fileContains(f, 'Model.init'));
    if (seqFiles.length) return { ormType: 'sequelize', files: seqFiles };

    const pyFiles = findFiles(projectRoot, '.py').filter(f => fileContains(f, 'declarative_base'));
    if (pyFiles.length) return { ormType: 'sqlalchemy', files: pyFiles };

    const sqlFiles = findFiles(projectRoot, '.sql').filter(f => fileContains(f, 'CREATE TABLE'));
    if (sqlFiles.length) return { ormType: 'raw-sql', files: sqlFiles };

    // Vector and document stores — check package.json and requirements.txt
    try {
      const pkgPath = path.join(projectRoot, 'package.json');
      if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        const deps = Object.keys({ ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) }).join(' ');
        const VECTOR = ['@pinecone-database/pinecone', 'weaviate-client', '@weaviate/client', '@qdrant/js-client-rest', 'chromadb', '@zilliz/milvus2-sdk-node', 'hnswlib-node'];
        const DOCDB  = ['mongodb', 'couchdb', 'pouchdb', 'arangojs', 'couchbase', 'cassandra-driver'];
        if (VECTOR.some(p => deps.includes(p))) return { ormType: 'vector-db', files: [pkgPath] };
        if (DOCDB.some(p => deps.includes(p)))  return { ormType: 'document-db', files: [pkgPath] };
      }
      const reqPath = path.join(projectRoot, 'requirements.txt');
      if (fs.existsSync(reqPath)) {
        const req = fs.readFileSync(reqPath, 'utf8');
        if (/pinecone|weaviate|qdrant|chromadb|milvus|faiss|annoy/i.test(req)) return { ormType: 'vector-db', files: [reqPath] };
        if (/pymongo|motor|couchdb|cassandra|arangodb/i.test(req)) return { ormType: 'document-db', files: [reqPath] };
      }
    } catch {}

    return { ormType: null, files: [] };
  } catch { return { ormType: null, files: [] }; }
}

function extractSchema(projectRoot) {
  try {
    const { ormType, files } = detectOrm(projectRoot);
    if (!ormType) return { detected: false, ormType: null, entities: [], parseWarnings: [] };

    const warnings = [];
    let entities = [];

    if (ormType === 'prisma') entities = parsers.parsePrisma(files[0], warnings);
    else if (ormType === 'typeorm') entities = parsers.parseTypeOrm(files, warnings);
    else if (ormType === 'drizzle') entities = parsers.parseDrizzle(files, warnings);
    else if (ormType === 'mongoose') entities = parsers.parseMongoose(files, warnings);
    else if (ormType === 'sequelize') entities = parsers.parseSequelize(files, warnings);
    else if (ormType === 'sqlalchemy') entities = parsers.parseSqlAlchemy(files, warnings);
    else if (ormType === 'raw-sql') entities = parsers.parseRawSql(files, warnings);
    else if (ormType === 'vector-db') entities = [
      { name: 'VectorIndex', fields: [{ name: 'id', type: 'string' }, { name: 'embedding', type: 'float[]' }, { name: 'metadata', type: 'object' }, { name: 'score', type: 'float' }], relations: [] },
      { name: 'Namespace', fields: [{ name: 'name', type: 'string' }, { name: 'vectorCount', type: 'int' }], relations: [{ fromEntity: 'Namespace', toEntity: 'VectorIndex', type: 'one-to-many' }] }
    ];
    else if (ormType === 'document-db') entities = [
      { name: 'Collection', fields: [{ name: '_id', type: 'ObjectId' }, { name: 'data', type: 'object' }, { name: 'createdAt', type: 'date' }, { name: 'updatedAt', type: 'date' }], relations: [] }
    ];

    entities = entities.filter(e => e.name && e.name.trim());
    return { detected: true, ormType, entities, parseWarnings: warnings };
  } catch (err) {
    return { detected: false, ormType: null, entities: [], parseWarnings: ['Fatal: ' + err.message] };
  }
}

module.exports = { extractSchema };
