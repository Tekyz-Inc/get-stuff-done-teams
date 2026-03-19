'use strict';
const { execFileSync } = require('child_process');
const path = require('path');

function detectTool(cmd) {
  try {
    const check = process.platform === 'win32' ? 'where' : 'which';
    execFileSync(check, [cmd], { stdio: 'pipe', timeout: 5000 });
    return true;
  } catch { return false; }
}

function detectMdToPdf() {
  try { execFileSync('npx', ['md-to-pdf', '--version'], { stdio: 'pipe', timeout: 10000 }); return true; }
  catch { return false; }
}

function exportToDocx(htmlPath) {
  try {
    const outputPath = htmlPath.replace(/\.html$/, '.docx');
    execFileSync('pandoc', [htmlPath, '-o', outputPath, '--from=html'], { timeout: 60000 });
    return { success: true, outputPath };
  } catch (err) { return { success: false, error: err.message }; }
}

function exportToPdf(htmlPath) {
  try {
    const outputPath = htmlPath.replace(/\.html$/, '.pdf');
    execFileSync('npx', ['md-to-pdf', htmlPath, '--output', outputPath], { timeout: 120000 });
    return { success: true, outputPath };
  } catch (err) { return { success: false, error: err.message }; }
}

function exportReport(htmlPath, format, options) {
  try {
    if (format !== 'docx' && format !== 'pdf') {
      return { success: false, error: 'Unknown export format: ' + format + '. Use docx or pdf.' };
    }
    if (format === 'docx' && !detectTool('pandoc')) {
      return { success: false, skipped: true, reason: 'Pandoc not found. Install: https://pandoc.org/installing.html' };
    }
    if (format === 'pdf' && !detectMdToPdf()) {
      return { success: false, skipped: true, reason: 'md-to-pdf not found. Install: npm install -g md-to-pdf' };
    }
    return format === 'docx' ? exportToDocx(htmlPath, options) : exportToPdf(htmlPath, options);
  } catch (err) { return { success: false, error: err.message }; }
}

module.exports = { exportReport };
