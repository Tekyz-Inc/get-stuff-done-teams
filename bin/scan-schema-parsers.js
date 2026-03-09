'use strict';
const fs = require('fs');
const path = require('path');

function parsePrisma(filePath, warnings) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const entities = [];
    const modelRe = /model\s+(\w+)\s*\{([^}]+)\}/g;
    let m;
    while ((m = modelRe.exec(content)) !== null) {
      const name = m[1];
      const body = m[2];
      const fields = [];
      let primaryKey = null;
      const relations = [];
      for (const line of body.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('@@')) continue;
        const parts = trimmed.split(/\s+/);
        if (parts.length < 2) continue;
        const fieldName = parts[0];
        const rawType = parts[1];
        const type = rawType.replace('?', '').replace('[]', '');
        const nullable = rawType.includes('?');
        const unique = trimmed.includes('@unique');
        if (trimmed.includes('@id')) primaryKey = fieldName;
        if (trimmed.includes('@relation')) {
          const relType = rawType.includes('[]') ? 'one-to-many' : 'many-to-one';
          relations.push({ type: relType, fromEntity: name, toEntity: type, throughTable: null });
        } else {
          fields.push({ name: fieldName, type, nullable, unique });
        }
      }
      entities.push({ name, fields, primaryKey, relations });
    }
    return entities;
  } catch (e) { warnings.push('parsePrisma: ' + e.message); return []; }
}

function parseTypeOrm(files, warnings) {
  const entities = [];
  for (const filePath of files) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const classMatch = content.match(/export class (\w+)/);
      if (!classMatch) continue;
      const name = classMatch[1];
      const fields = [];
      let primaryKey = null;
      const relations = [];
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (/@PrimaryGeneratedColumn|@PrimaryColumn/.test(line)) {
          const next = (lines[i + 1] || '').trim();
          const nm = next.match(/(\w+)\s*:/);
          if (nm) primaryKey = nm[1];
        } else if (/@Column/.test(line)) {
          const next = (lines[i + 1] || '').trim();
          const nm = next.match(/(\w+)\s*:\s*(\w+)/);
          if (nm) fields.push({ name: nm[1], type: nm[2], nullable: line.includes('nullable: true'), unique: line.includes('unique: true') });
        } else if (/@(ManyToOne|OneToMany|ManyToMany|OneToOne)\(/.test(line)) {
          const tm = line.match(/\(\s*\(\s*\)\s*=>\s*(\w+)/);
          const relMap = { ManyToOne: 'many-to-one', OneToMany: 'one-to-many', ManyToMany: 'many-to-many', OneToOne: 'one-to-one' };
          const rm = line.match(/@(\w+)\(/);
          if (tm && rm) relations.push({ type: relMap[rm[1]] || 'many-to-one', fromEntity: name, toEntity: tm[1], throughTable: null });
        }
      }
      entities.push({ name, fields, primaryKey, relations });
    } catch (e) { warnings.push('parseTypeOrm: ' + e.message); }
  }
  return entities;
}

function parseDrizzle(files, warnings) {
  const entities = [];
  for (const filePath of files) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const tableRe = /(?:pgTable|mysqlTable|sqliteTable)\s*\(\s*['"](\w+)['"]/g;
      let m;
      while ((m = tableRe.exec(content)) !== null) {
        const name = m[1];
        const fields = [];
        const colRe = /(\w+)\s*:\s*\w+\(/g;
        let cm;
        while ((cm = colRe.exec(content)) !== null) {
          fields.push({ name: cm[1], type: 'unknown', nullable: true, unique: false });
        }
        entities.push({ name, fields, primaryKey: null, relations: [] });
      }
    } catch (e) { warnings.push('parseDrizzle: ' + e.message); }
  }
  return entities;
}

function parseMongoose(files, warnings) {
  const entities = [];
  for (const filePath of files) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const nameMatch = content.match(/const\s+(\w+)Schema\s*=\s*new\s+(?:mongoose\.)?Schema/);
      const name = nameMatch ? nameMatch[1] : path.basename(filePath, path.extname(filePath));
      const fields = [];
      const relations = [];
      const fieldRe = /(\w+)\s*:\s*\{[^}]*type\s*:\s*(\w+)/g;
      let m;
      while ((m = fieldRe.exec(content)) !== null) {
        fields.push({ name: m[1], type: m[2], nullable: true, unique: false });
      }
      const refRe = /ref\s*:\s*['"](\w+)['"]/g;
      while ((m = refRe.exec(content)) !== null) {
        relations.push({ type: 'many-to-one', fromEntity: name, toEntity: m[1], throughTable: null });
      }
      entities.push({ name, fields, primaryKey: '_id', relations });
    } catch (e) { warnings.push('parseMongoose: ' + e.message); }
  }
  return entities;
}

function parseSequelize(files, warnings) {
  const entities = [];
  for (const filePath of files) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const classMatch = content.match(/class (\w+) extends Model/);
      if (!classMatch) continue;
      const name = classMatch[1];
      const fields = [];
      let primaryKey = null;
      const colRe = /(\w+)\s*:\s*\{[^}]*type\s*:\s*DataTypes\.(\w+)([^}]*)\}/g;
      let m;
      while ((m = colRe.exec(content)) !== null) {
        const isPk = m[3].includes('primaryKey: true');
        if (isPk) primaryKey = m[1];
        fields.push({ name: m[1], type: 'DataTypes.' + m[2], nullable: !m[3].includes('allowNull: false'), unique: m[3].includes('unique: true') });
      }
      entities.push({ name, fields, primaryKey, relations: [] });
    } catch (e) { warnings.push('parseSequelize: ' + e.message); }
  }
  return entities;
}

function parseSqlAlchemy(files, warnings) {
  const entities = [];
  for (const filePath of files) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const classRe = /class (\w+)\s*\([^)]*Base[^)]*\):/g;
      let m;
      while ((m = classRe.exec(content)) !== null) {
        const name = m[1];
        const fields = [];
        let primaryKey = null;
        const colRe = /(\w+)\s*=\s*Column\((\w+)([^)]*)\)/g;
        let cm;
        while ((cm = colRe.exec(content)) !== null) {
          if (cm[3].includes('primary_key=True')) primaryKey = cm[1];
          fields.push({ name: cm[1], type: cm[2], nullable: !cm[3].includes('nullable=False'), unique: cm[3].includes('unique=True') });
        }
        entities.push({ name, fields, primaryKey, relations: [] });
      }
    } catch (e) { warnings.push('parseSqlAlchemy: ' + e.message); }
  }
  return entities;
}

function parseRawSql(files, warnings) {
  const entities = [];
  for (const filePath of files) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const tableRe = /CREATE TABLE\s+[`"]?(\w+)[`"]?\s*\(([^;]+)\)/gi;
      let m;
      while ((m = tableRe.exec(content)) !== null) {
        const name = m[1];
        const body = m[2];
        const fields = [];
        let primaryKey = null;
        for (const line of body.split('\n')) {
          const trimmed = line.trim().replace(/,$/, '');
          if (!trimmed || trimmed.startsWith('--') || /^PRIMARY KEY\s*\(/i.test(trimmed)) continue;
          const parts = trimmed.split(/\s+/);
          if (parts.length < 2) continue;
          const fieldName = parts[0].replace(/[`"]/g, '');
          const type = parts[1];
          const isPk = /PRIMARY KEY/i.test(trimmed);
          if (isPk) primaryKey = fieldName;
          fields.push({ name: fieldName, type, nullable: !/NOT NULL/i.test(trimmed), unique: /\bUNIQUE\b/i.test(trimmed) });
        }
        entities.push({ name, fields, primaryKey, relations: [] });
      }
    } catch (e) { warnings.push('parseRawSql: ' + e.message); }
  }
  return entities;
}

module.exports = { parsePrisma, parseTypeOrm, parseDrizzle, parseMongoose, parseSequelize, parseSqlAlchemy, parseRawSql };
