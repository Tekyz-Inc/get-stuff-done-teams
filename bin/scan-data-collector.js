'use strict';
const fs = require('fs');
const path = require('path');

function read(filePath) {
  try { return fs.readFileSync(filePath, 'utf8'); } catch { return ''; }
}

function parseDebtSummary(text) {
  const n = (pattern) => { const m = text.match(pattern); return m ? parseInt(m[1], 10) : 0; };
  return {
    debtCritical: n(/Critical items?:\s*(\d+)/i),
    debtHigh:     n(/High priority:\s*(\d+)/i),
    debtMedium:   n(/Medium priority:\s*(\d+)/i)
  };
}

function parseTestCoverage(text) {
  const total   = text.match(/Total tests\s*\|\s*(\d+)/i);
  const passing = text.match(/Passing\s*\|\s*(\d+)/i);
  if (total && passing) return parseInt(passing[1], 10) + '/' + parseInt(total[1], 10);
  return 'N/A';
}

function parseFilesAndLoc(text) {
  // Match: | **Total JS** | 19 files | **2,934 lines** | |
  const m = text.match(/\|\s*\*?\*?Total[^|]*\*?\*?\s*\|\s*(\d+)\s+files?\s*\|\s*\*?\*?([\d,]+)[^|]*\*?\*?\s*\|/i);
  if (m) return { filesScanned: parseInt(m[1], 10), totalLoc: parseInt(m[2].replace(/,/g, ''), 10) };
  return { filesScanned: 0, totalLoc: 0 };
}

function parseComponents(text) {
  const sectionMatch = text.match(/## Component Inventory([\s\S]*?)(?=\n## |\n---|\n#[^#]|$)/);
  if (!sectionMatch) return [];
  return sectionMatch[1].split('\n')
    .filter(l => /^\|/.test(l) && !/---/.test(l) && !/Component.*File/i.test(l))
    .map(row => {
      const cols = row.split('|').map(c => c.trim()).filter(Boolean);
      if (cols.length < 3) return null;
      const name = cols[0].replace(/\*\*/g, '').trim();
      if (!name || /^total/i.test(name)) return null;
      const fileCountMatch = cols[1].match(/(\d+)\s+files?/i);
      const files = fileCountMatch ? parseInt(fileCountMatch[1], 10) : (cols[1] ? 1 : 0);
      const locMatch = cols[2].match(/[\d,]+/);
      const loc = locMatch ? parseInt(locMatch[0].replace(/,/g, ''), 10) : 0;
      // Health heuristic: files > 200 lines get lower score
      const healthScore = loc > 200 ? 60 : 90;
      return { name, files, loc, healthScore };
    })
    .filter(Boolean);
}

function parseSecurityFindings(text) {
  if (!text) return [];
  const findings = [];
  const secs = text.split(/\n### /).slice(1);
  for (const sec of secs) {
    const titleLine = sec.split('\n')[0];
    if (!/SEC-[HM]\d+/.test(titleLine)) continue;
    const idM    = titleLine.match(/(SEC-[HM]\d+)/);
    const nameM  = titleLine.match(/SEC-[HM]\d+:\s*(.+?)(?:\s+[-–][-–]|\s*$)/);
    const detM   = sec.match(/- \*\*Details\*\*:\s*(.+?)(?=\n-|\n\n|$)/s);
    const fixM   = sec.match(/- \*\*Fix\*\*:\s*(.+?)(?=\n-|\n\n|$)/s);
    findings.push({
      category: /SEC-H/.test(titleLine) ? 'Security — HIGH' : 'Security — MEDIUM',
      title:    (idM ? idM[1] : '') + (nameM ? ': ' + nameM[1].trim() : ''),
      description:    detM ? detM[1].trim().replace(/\n/g, ' ') : '',
      recommendation: fixM ? fixM[1].trim().replace(/\n/g, ' ') : ''
    });
  }
  return findings;
}

function parseQualityItems(text) {
  if (!text) return [];
  const findings = [];
  // Parse rows from open item status table: | TD-NNN | Title | Status |
  const tableMatch = text.match(/\| ID \| Title \| Status \|([\s\S]*?)(?=\n---|\n## |$)/i);
  if (!tableMatch) return [];
  tableMatch[1].split('\n')
    .filter(l => /^\|/.test(l) && !/---/.test(l) && !/\| ID \|/.test(l))
    .slice(0, 5) // top 5
    .forEach(row => {
      const cols = row.split('|').map(c => c.trim()).filter(Boolean);
      if (cols.length < 3) return;
      findings.push({
        category: 'Quality',
        title: cols[0] + ': ' + cols[1],
        description: cols[2] || '',
        recommendation: 'Review and schedule remediation'
      });
    });
  return findings;
}

function collectScanData(projectRoot) {
  const scanDir = path.join(projectRoot, '.gsd-t', 'scan');
  const archText  = read(path.join(scanDir, 'architecture.md'));
  const testText  = read(path.join(scanDir, 'test-baseline.md'));
  const secText   = read(path.join(scanDir, 'security.md'));
  const qualText  = read(path.join(scanDir, 'quality.md'));
  const debtText  = read(path.join(projectRoot, '.gsd-t', 'techdebt.md'));

  let projectName = path.basename(projectRoot);
  try { projectName = JSON.parse(read(path.join(projectRoot, 'package.json'))).name || projectName; } catch {}

  const { filesScanned, totalLoc } = parseFilesAndLoc(archText);
  const { debtCritical, debtHigh, debtMedium } = parseDebtSummary(debtText);
  const testCoverage = parseTestCoverage(testText);
  const domains  = parseComponents(archText);
  const secFinds = parseSecurityFindings(secText);
  const qualFinds = parseQualityItems(qualText);
  const findings = secFinds.concat(qualFinds).slice(0, 10);

  return { projectName, filesScanned, totalLoc, debtCritical, debtHigh, debtMedium,
           testCoverage, domains, techDebt: [], findings };
}

module.exports = { collectScanData };
