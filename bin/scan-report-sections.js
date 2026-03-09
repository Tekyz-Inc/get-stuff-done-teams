'use strict';

function buildMetricCards(analysisData) {
  const d = analysisData || {};
  const metrics = [
    { label: 'Files Scanned',   value: d.filesScanned || 0 },
    { label: 'Lines of Code',   value: (d.totalLoc || 0).toLocaleString() },
    { label: 'Critical Issues', value: d.debtCritical || 0 },
    { label: 'High Issues',     value: d.debtHigh     || 0 },
    { label: 'Medium Issues',   value: d.debtMedium   || 0 },
    { label: 'Test Coverage',   value: d.testCoverage || 'N/A' }
  ];
  const cards = metrics.map(m =>
    '<div class="metric-card"><div class="label">' + m.label + '</div><div class="value">' + m.value + '</div></div>'
  ).join('');
  return '<section id="summary"><h2>Summary</h2><div class="metric-grid">' + cards + '</div></section>';
}

function buildDomainHealth(analysisData) {
  const domains = (analysisData && analysisData.domains) || [];
  if (!domains.length) {
    return '<section id="domains"><h2>Component Inventory</h2><p style="color:var(--text-muted)">No component data available.</p></section>';
  }
  const rows = domains.map(d =>
    '<tr>' +
    '<td><strong>' + esc(d.name) + '</strong></td>' +
    '<td class="file-path">' + esc(d.filePath || '') + '</td>' +
    '<td class="loc-cell">' + esc(d.size || '') + '</td>' +
    '<td style="color:var(--text-muted);font-size:12px">' + esc(d.purpose || '') + '</td>' +
    '</tr>'
  ).join('');
  return '<section id="domains"><h2>Component Inventory</h2>' +
    '<table><thead><tr><th>Component</th><th>File(s)</th><th>Lines</th><th>Purpose</th></tr></thead>' +
    '<tbody>' + rows + '</tbody></table></section>';
}

function buildDiagramSection(diagramResult) {
  const d = diagramResult;
  return '<section id="diagram-' + d.type + '" class="diagram-section">' +
    '<div class="diagram-header">' +
    '<div><h2>' + d.title + '</h2><span class="type-badge">' + d.typeBadge + '</span></div>' +
    '<button class="expand-btn" onclick="openModal(\'' + d.type + '\')">&#x26F6; Expand</button>' +
    '</div>' +
    '<div class="diagram-container" id="diagram-' + d.type + '-inner">' + d.svgContent + '</div>' +
    '<p class="diagram-note">' + d.note + '</p>' +
    '</section>';
}

function buildTechDebt(analysisData) {
  const items = (analysisData && analysisData.techDebt) || [];
  if (!items.length) {
    return '<section id="tech-debt"><h2>Tech Debt Register</h2><p style="color:var(--text-muted)">No open tech debt items.</p></section>';
  }
  const rows = items.map(i =>
    '<tr><td><span class="badge badge-' + i.severity + '">' + i.severity.toUpperCase() + '</span></td>' +
    '<td style="font-family:monospace;font-size:12px;color:var(--accent)">' + esc(i.domain || '') + '</td>' +
    '<td>' + esc(i.issue || '') + '</td>' +
    '<td style="color:var(--text-muted);font-size:12px">' + esc(i.location || '') + '</td>' +
    '<td style="color:var(--text-muted);font-size:12px">' + esc(i.effort || '') + '</td></tr>'
  ).join('');
  return '<section id="tech-debt"><h2>Tech Debt Register</h2>' +
    '<table><thead><tr><th>Severity</th><th>ID</th><th>Issue</th><th>Location</th><th>Effort</th></tr></thead>' +
    '<tbody>' + rows + '</tbody></table></section>';
}

const SEV_COLORS = { critical: '#f85149', high: '#e3b341', medium: '#d29922', low: '#58a6ff' };

function buildFindings(analysisData) {
  const findings = (analysisData && analysisData.findings) || [];
  if (!findings.length) {
    return '<section id="findings"><h2>Key Findings</h2><p style="color:var(--text-muted)">No findings recorded.</p></section>';
  }
  const cards = findings.map(f => {
    const sev = (f.severity || 'medium').toLowerCase();
    const color = SEV_COLORS[sev] || SEV_COLORS.medium;
    return '<div class="finding-card" style="border-left-color:' + color + '">' +
      '<div class="finding-header">' +
      '<span class="sev-badge" style="background:' + color + '22;color:' + color + '">' + sev.toUpperCase() + '</span>' +
      '<span class="finding-cat">' + esc(f.category || '') + '</span>' +
      '</div>' +
      '<div class="finding-title">' + esc(f.title || '') + '</div>' +
      '<p class="finding-desc">' + esc(f.description || '') + '</p>' +
      (f.recommendation
        ? '<div class="finding-rec"><span class="rec-label">Recommendation</span>' + esc(f.recommendation) + '</div>'
        : '') +
      '</div>';
  }).join('');
  return '<section id="findings"><h2>Key Findings</h2>' + cards + '</section>';
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

module.exports = { buildMetricCards, buildDomainHealth, buildDiagramSection, buildTechDebt, buildFindings };
