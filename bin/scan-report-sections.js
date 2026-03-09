'use strict';

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function buildMetricCards(d) {
  d = d || {};
  const loc = d.totalLoc > 999 ? (d.totalLoc / 1000).toFixed(1) + 'k' : (d.totalLoc || 0);
  const cov = d.testCoverage || 'N/A';
  const metrics = [
    { label: 'Files Scanned',   value: d.filesScanned || 0, sub: 'across all components', bar: 'g' },
    { label: 'Lines of Code',   value: loc,                  sub: 'source code',           bar: '' },
    { label: 'Critical Issues', value: d.debtCritical || 0, sub: 'requires immediate fix', bar: 'r' },
    { label: 'High Issues',     value: d.debtHigh || 0,     sub: 'fix before next release', bar: 'o' },
    { label: 'Medium Issues',   value: d.debtMedium || 0,   sub: 'plan to address',        bar: 'y' },
    { label: 'Test Coverage',   value: cov,                  sub: 'passing tests',          bar: 'g' }
  ];
  const cards = metrics.map(m =>
    '<div class="mc"><div class="mc-bar' + (m.bar ? ' ' + m.bar : '') + '"></div>' +
    '<div class="mc-lbl">' + m.label + '</div>' +
    '<div class="mc-val">' + m.value + '</div>' +
    '<div class="mc-sub">' + m.sub + '</div></div>'
  ).join('');
  return '<section id="summary"><div class="sl">Summary</div><div class="mxg">' + cards + '</div></section>';
}

function buildDomainHealth(d) {
  d = d || {};
  const domains = d.domains || [];
  if (!domains.length) {
    return '<section id="domains"><div class="sl">Component Inventory</div>' +
      '<p style="color:var(--muted2);font-size:12px">No component data available.</p></section>';
  }
  const rows = domains.map(item => {
    const bigFile = parseInt(item.size) > 500;
    const sizeColor = bigFile ? 'color:var(--amber)' : 'color:var(--blue)';
    return '<tr>' +
      '<td><strong>' + esc(item.name) + '</strong></td>' +
      '<td style="font-family:\'Consolas\',monospace;font-size:10px;color:var(--muted2)">' + esc(item.filePath || '') + '</td>' +
      '<td class="loc-cell" style="' + sizeColor + '">' + esc(item.size || '') + '</td>' +
      '<td style="color:var(--muted2);font-size:11px">' + esc(item.purpose || '') + '</td>' +
      '</tr>';
  }).join('');
  return '<section id="domains"><div class="sl">Component Inventory</div>' +
    '<div class="tw"><table><thead><tr><th>Component</th><th>File(s)</th><th>Lines</th><th>Purpose</th></tr></thead>' +
    '<tbody>' + rows + '</tbody></table></div></section>';
}

function buildDiagramSection(d) {
  const secId = 'diagram-' + d.type;
  const cardTitle = esc(d.title + (d.typeBadge ? ' \u2014 ' + d.typeBadge : ''));
  let diagramContent;
  if (d.mmdSource) {
    // Always use browser-side Mermaid rendering for best visual quality with dark theme
    diagramContent = '<div class="mermaid">\n' + d.mmdSource + '\n</div>';
  } else if (d.svgContent && !d.svgContent.includes('diagram-placeholder')) {
    diagramContent = '<div style="width:100%;overflow:auto">' + d.svgContent + '</div>';
  } else {
    diagramContent = d.svgContent ||
      '<div class="diagram-placeholder"><p>Diagram unavailable</p></div>';
  }
  return '<section id="' + secId + '">' +
    '<div class="sl">' + esc(d.title) + '</div>' +
    '<div class="dc" data-title="' + cardTitle + '">' +
    '<div class="dc-h"><div class="dc-hl">' +
    '<span class="dc-t">' + esc(d.title) + '</span>' +
    '<span class="dc-tag">' + esc(d.typeBadge) + '</span>' +
    '</div><button class="btn-exp" onclick="expandDiagram(this)">&#x26F6;<span class="lbl">Expand</span></button>' +
    '</div>' +
    '<div class="dc-b">' + diagramContent + '</div>' +
    '<div class="dc-n">' + esc(d.note) + '</div>' +
    '</div></section>';
}

function buildTechDebt(d) {
  d = d || {};
  const items = d.techDebt || [];
  if (!items.length) {
    return '<section id="tech-debt"><div class="sl">Tech Debt Register</div>' +
      '<p style="color:var(--muted2);font-size:12px">No open tech debt items.</p></section>';
  }
  const sevClass = { critical: 'c', high: 'h', medium: 'm', low: 'l', info: 'i' };
  const rows = items.map(i => {
    const sc = sevClass[(i.severity || '').toLowerCase()] || 'm';
    return '<tr>' +
      '<td><span class="bx ' + sc + '">' + esc(i.severity || '') + '</span></td>' +
      '<td style="font-family:\'Consolas\',monospace;font-size:11px;color:var(--blue)">' + esc(i.domain || '') + '</td>' +
      '<td>' + esc(i.issue || '') + '</td>' +
      '<td><code>' + esc(i.location || '') + '</code></td>' +
      '<td style="color:var(--muted2);font-size:11px">' + esc(i.effort || '') + '</td>' +
      '</tr>';
  }).join('');
  return '<section id="tech-debt"><div class="sl">Tech Debt Register</div>' +
    '<div class="tw"><table><thead><tr><th>Severity</th><th>Domain</th><th>Issue</th><th>Location</th><th>Effort</th></tr></thead>' +
    '<tbody>' + rows + '</tbody></table></div></section>';
}

const ICONS = {
  security: '&#128721;', architecture: '&#9889;', reliability: '&#128202;',
  quality: '&#128196;', performance: '&#9888;', strength: '&#9989;', default: '&#128203;'
};

function buildFindings(d) {
  d = d || {};
  const findings = d.findings || [];
  if (!findings.length) {
    return '<section id="findings"><div class="sl">Key Findings</div>' +
      '<p style="color:var(--muted2);font-size:12px">No findings recorded.</p></section>';
  }
  const cards = findings.map(f => {
    const cat = (f.category || '').toLowerCase();
    const ico = ICONS[cat] || ICONS.default;
    const rec = f.recommendation
      ? ' <strong style="color:var(--text)">Fix:</strong> ' + esc(f.recommendation) : '';
    return '<div class="fi"><div class="ico">' + ico + '</div>' +
      '<div><h4>' + esc(f.title || '') + '</h4>' +
      '<p>' + esc(f.description || '') + rec + '</p>' +
      '</div></div>';
  }).join('');
  return '<section id="findings"><div class="sl">Key Findings</div><div class="fl">' + cards + '</div></section>';
}

module.exports = { buildMetricCards, buildDomainHealth, buildDiagramSection, buildTechDebt, buildFindings };
