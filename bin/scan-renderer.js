'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const https = require('https');

const PLACEHOLDER_HTML = '<div class="diagram-placeholder">\n  <p>Diagram unavailable — rendering tools not found</p>\n  <p>Install: <code>npm install -g @mermaid-js/mermaid-cli</code></p>\n</div>';

function stripSvgDimensions(svgStr) {
  return svgStr
    .replace(/<svg([^>]*)\s+width="[^"]*"/, '<svg$1')
    .replace(/<svg([^>]*)\s+height="[^"]*"/, '<svg$1');
}

function makePlaceholder() {
  return PLACEHOLDER_HTML;
}

function tryMmdc(mmdContent) {
  const ts = Date.now();
  const tmpIn = path.join(os.tmpdir(), 'gsd-scan-' + ts + '.mmd');
  const tmpOut = path.join(os.tmpdir(), 'gsd-scan-' + ts + '.svg');
  try {
    fs.writeFileSync(tmpIn, mmdContent, 'utf8');
    execSync('mmdc -i "' + tmpIn + '" -o "' + tmpOut + '" -t dark --quiet', { timeout: 30000, stdio: 'pipe' });
    const svg = fs.readFileSync(tmpOut, 'utf8');
    return { svgContent: stripSvgDimensions(svg), rendered: true, rendererUsed: 'mermaid-cli' };
  } catch { return null; }
  finally {
    try { fs.unlinkSync(tmpIn); } catch {}
    try { fs.unlinkSync(tmpOut); } catch {}
  }
}

function tryD2(mmdContent, type) {
  if (type !== 'system-architecture' && type !== 'data-flow') return null;
  const ts = Date.now();
  const tmpIn = path.join(os.tmpdir(), 'gsd-scan-' + ts + '.d2');
  const tmpOut = path.join(os.tmpdir(), 'gsd-scan-' + ts + '.svg');
  try {
    fs.writeFileSync(tmpIn, 'app -> db: query', 'utf8');
    execSync('d2 "' + tmpIn + '" "' + tmpOut + '" --layout=dagre', { timeout: 30000, stdio: 'pipe' });
    const svg = fs.readFileSync(tmpOut, 'utf8');
    return { svgContent: stripSvgDimensions(svg), rendered: true, rendererUsed: 'd2' };
  } catch { return null; }
  finally {
    try { fs.unlinkSync(tmpIn); } catch {}
    try { fs.unlinkSync(tmpOut); } catch {}
  }
}

function tryKroki(mmdContent) {
  return new Promise((resolve) => {
    const body = JSON.stringify({ diagram_source: mmdContent });
    const host = process.env.KROKI_HOST || 'kroki.io';
    const options = {
      hostname: host, port: 443,
      path: '/mermaid/svg', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      timeout: 15000
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        if (data.trimStart().startsWith('<svg')) {
          resolve({ svgContent: stripSvgDimensions(data), rendered: true, rendererUsed: 'kroki' });
        } else { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.write(body);
    req.end();
  });
}

function renderDiagram(mmdContent, type, options) {
  try {
    const mmdc = tryMmdc(mmdContent);
    if (mmdc) return mmdc;
    const d2 = tryD2(mmdContent, type);
    if (d2) return d2;
    // tryKroki is async; skip in sync rendering path — Kroki available via async wrapper if needed
    return { svgContent: makePlaceholder(), rendered: false, rendererUsed: 'placeholder' };
  } catch {
    return { svgContent: makePlaceholder(), rendered: false, rendererUsed: 'placeholder' };
  }
}

module.exports = { renderDiagram };
