#!/usr/bin/env node
// Minimal test runner for the benchmark fixture. Runs every *.test.js
// file under test/bench/ as a plain Node require. Each test file should
// throw on failure and be silent on success. Missing dir / no files is OK
// (tolerates the pre-wave-0 state).
'use strict';

const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'bench');
if (!fs.existsSync(dir)) process.exit(0);
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.test.js')).sort();
for (const f of files) {
  try {
    require(path.resolve(dir, f));
  } catch (e) {
    process.stderr.write(`FAIL ${f}: ${e && e.message}\n`);
    process.exit(1);
  }
}
process.stdout.write(`OK ${files.length} test file(s)\n`);
