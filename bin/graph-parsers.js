'use strict';

/**
 * Language-specific parsers for extracting code entities.
 * Zero external dependencies — regex-based only.
 */

// --- JS/TS Parser ---

const JS_FUNC_PATTERNS = [
  // function declarations: function name(, async function name(
  /^\s*(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(/gm,
  // arrow/const: const name = (, const name = function(, const name = async (
  /^\s*(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?(?:function\s*)?\(/gm,
  // arrow with =>: const name = (...) =>
  /^\s*(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\([^)]*\)\s*=>/gm,
];

const JS_CLASS_PATTERN = /^\s*(?:export\s+)?(?:default\s+)?class\s+(\w+)/gm;

const JS_METHOD_PATTERN = /^\s+(?:async\s+)?(\w+)\s*\([^)]*\)\s*\{/gm;

const JS_IMPORT_PATTERNS = [
  // import { x, y } from 'module'
  /^\s*import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/gm,
  // import x from 'module'
  /^\s*import\s+(\w+)\s+from\s+['"]([^'"]+)['"]/gm,
  // import * as x from 'module'
  /^\s*import\s+\*\s+as\s+(\w+)\s+from\s+['"]([^'"]+)['"]/gm,
  // const x = require('module')
  /^\s*(?:const|let|var)\s+(?:\{([^}]+)\}|(\w+))\s*=\s*require\(\s*['"]([^'"]+)['"]\s*\)/gm,
];

const JS_EXPORT_PATTERNS = [
  // module.exports = { ... } or module.exports = name
  /^\s*module\.exports\s*=\s*/gm,
  // export default
  /^\s*export\s+default\s+/gm,
  // export { x, y }
  /^\s*export\s+\{([^}]+)\}/gm,
];

function parseJavaScript(content, filePath) {
  const entities = [];
  const imports = [];
  const calls = [];
  const lines = content.split('\n');
  const exportedNames = new Set();
  let currentClass = null;

  // Collect exported names
  for (const line of lines) {
    if (/^\s*export\s+/.test(line)) {
      const m = line.match(/(?:function|class|const|let|var)\s+(\w+)/);
      if (m) exportedNames.add(m[1]);
    }
    const exportMatch = line.match(/^\s*export\s+\{([^}]+)\}/);
    if (exportMatch) {
      exportMatch[1].split(',').forEach(n => {
        const name = n.trim().split(/\s+as\s+/)[0].trim();
        if (name) exportedNames.add(name);
      });
    }
    if (/module\.exports/.test(line)) {
      const m = line.match(/module\.exports\s*=\s*\{\s*([^}]+)\}/);
      if (m) {
        m[1].split(',').forEach(n => {
          const name = n.trim().split(':')[0].trim();
          if (name) exportedNames.add(name);
        });
      }
    }
  }

  // Extract entities line by line
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Class declarations
    const classMatch = line.match(
      /^\s*(?:export\s+)?(?:default\s+)?class\s+(\w+)/
    );
    if (classMatch) {
      currentClass = classMatch[1];
      entities.push({
        id: `${filePath}:${lineNum}:${classMatch[1]}`,
        name: classMatch[1],
        type: 'class',
        file: filePath,
        line: lineNum,
        domain: null,
        exported: exportedNames.has(classMatch[1]) ||
                  /export/.test(line)
      });
      continue;
    }

    // Method declarations (inside class)
    if (currentClass) {
      const methodMatch = line.match(
        /^\s+(?:static\s+)?(?:async\s+)?(\w+)\s*\([^)]*\)\s*\{/
      );
      if (methodMatch && methodMatch[1] !== 'constructor') {
        entities.push({
          id: `${filePath}:${lineNum}:${methodMatch[1]}`,
          name: methodMatch[1],
          type: 'method',
          file: filePath,
          line: lineNum,
          domain: null,
          exported: exportedNames.has(currentClass)
        });
        continue;
      }
      // Detect end of class
      if (/^}/.test(line)) currentClass = null;
    }

    // Function declarations
    const funcMatch = line.match(
      /^\s*(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(/
    );
    if (funcMatch) {
      entities.push({
        id: `${filePath}:${lineNum}:${funcMatch[1]}`,
        name: funcMatch[1],
        type: 'function',
        file: filePath,
        line: lineNum,
        domain: null,
        exported: exportedNames.has(funcMatch[1]) ||
                  /export/.test(line)
      });
      continue;
    }

    // Arrow/const functions
    const arrowMatch = line.match(
      /^\s*(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?(?:function\s*)?\(/
    ) || line.match(
      /^\s*(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\([^)]*\)\s*=>/
    );
    if (arrowMatch) {
      entities.push({
        id: `${filePath}:${lineNum}:${arrowMatch[1]}`,
        name: arrowMatch[1],
        type: 'function',
        file: filePath,
        line: lineNum,
        domain: null,
        exported: exportedNames.has(arrowMatch[1]) ||
                  /export/.test(line)
      });
      continue;
    }

    // Import statements
    const esImportNamed = line.match(
      /^\s*import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/
    );
    if (esImportNamed) {
      const names = esImportNamed[1].split(',').map(n =>
        n.trim().split(/\s+as\s+/)[0].trim()
      ).filter(Boolean);
      imports.push({
        source: filePath,
        target: esImportNamed[2],
        names,
        line: lineNum
      });
      continue;
    }

    const esImportDefault = line.match(
      /^\s*import\s+(\w+)\s+from\s+['"]([^'"]+)['"]/
    );
    if (esImportDefault) {
      imports.push({
        source: filePath,
        target: esImportDefault[2],
        names: [esImportDefault[1]],
        line: lineNum
      });
      continue;
    }

    const esImportStar = line.match(
      /^\s*import\s+\*\s+as\s+(\w+)\s+from\s+['"]([^'"]+)['"]/
    );
    if (esImportStar) {
      imports.push({
        source: filePath,
        target: esImportStar[2],
        names: [esImportStar[1]],
        line: lineNum
      });
      continue;
    }

    const requireMatch = line.match(
      /^\s*(?:const|let|var)\s+(?:\{([^}]+)\}|(\w+))\s*=\s*require\(\s*['"]([^'"]+)['"]\s*\)/
    );
    if (requireMatch) {
      const names = requireMatch[1]
        ? requireMatch[1].split(',').map(n =>
            n.trim().split(':')[0].trim()
          ).filter(Boolean)
        : [requireMatch[2]];
      imports.push({
        source: filePath,
        target: requireMatch[3],
        names,
        line: lineNum
      });
    }
  }

  // Extract calls (best-effort: known entity names followed by '(')
  const entityNames = new Set(entities.map(e => e.name));
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Skip declarations, imports, comments
    if (/^\s*(\/\/|\/\*|import |const |let |var |function |class |export )/.test(line)) continue;
    for (const name of entityNames) {
      const re = new RegExp(`\\b${name}\\s*\\(`, 'g');
      if (re.test(line)) {
        calls.push({ caller: `${filePath}:${i + 1}:_caller`, callee: name, line: i + 1 });
      }
    }
  }

  return { entities, imports, calls };
}

// --- Python Parser ---

function parsePython(content, filePath) {
  const entities = [];
  const imports = [];
  const calls = [];
  const lines = content.split('\n');
  let currentClass = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Class declaration
    const classMatch = line.match(/^class\s+(\w+)\s*[:(]/);
    if (classMatch) {
      currentClass = classMatch[1];
      entities.push({
        id: `${filePath}:${lineNum}:${classMatch[1]}`,
        name: classMatch[1],
        type: 'class',
        file: filePath,
        line: lineNum,
        domain: null,
        exported: true
      });
      continue;
    }

    // Function/method declaration
    const defMatch = line.match(/^(\s*)def\s+(\w+)\s*\(/);
    if (defMatch) {
      const indent = defMatch[1].length;
      const isMethod = indent > 0 && currentClass;
      if (!defMatch[2].startsWith('_') || defMatch[2] === '__init__') {
        entities.push({
          id: `${filePath}:${lineNum}:${defMatch[2]}`,
          name: defMatch[2],
          type: isMethod ? 'method' : 'function',
          file: filePath,
          line: lineNum,
          domain: null,
          exported: !defMatch[2].startsWith('_')
        });
      }
      continue;
    }

    // Reset class context on unindented non-empty line
    if (currentClass && /^\S/.test(line) && line.trim()) {
      currentClass = null;
    }

    // import x, import x as y
    const importMatch = line.match(/^import\s+([\w.]+)/);
    if (importMatch) {
      imports.push({
        source: filePath,
        target: importMatch[1],
        names: [importMatch[1].split('.').pop()],
        line: lineNum
      });
      continue;
    }

    // from x import y, z
    const fromMatch = line.match(/^from\s+([\w.]+)\s+import\s+(.+)/);
    if (fromMatch) {
      const names = fromMatch[2].split(',').map(n =>
        n.trim().split(/\s+as\s+/)[0].trim()
      ).filter(Boolean);
      imports.push({
        source: filePath,
        target: fromMatch[1],
        names,
        line: lineNum
      });
    }
  }

  return { entities, imports, calls };
}

function getParser(ext) {
  if (['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx'].includes(ext)) {
    return parseJavaScript;
  }
  if (ext === '.py') return parsePython;
  return null;
}

module.exports = { parseJavaScript, parsePython, getParser };
