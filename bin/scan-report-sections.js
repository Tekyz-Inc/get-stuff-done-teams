'use strict';

function buildMetricCards(analysisData) {
  const d = analysisData || {};
  const metrics = [
    { label: 'Files Scanned', value: d.filesScanned || 0 },
    { label: 'Lines of Code', value: d.totalLoc || 0 },
    { label: 'Critical Issues', value: d.debtCritical || 0 },
    { label: 'High Issues', value: d.debtHigh || 0 },
    { label: 'Medium Issues', value: d.debtMedium || 0 },
    { label: 'Test Coverage', value: d.testCoverage || 'N/A' }
  ];
  const cards = metrics.map(m =>
    '<div class="metric-card"><div class="label">' + m.label + '</div><div class="value">' + m.value + '</div></div>'
  ).join('');
  return '<section id="summary"><h2>Summary</h2><div class="metric-grid">' + cards + '</div></section>';
}

function buildDomainHealth(analysisData) {
  const domains = (analysisData && analysisData.domains) || [];
  if (!domains.length) {
    return '<section id="domains"><h2>Domains</h2><p style="color:var(--text-muted)">No domain data available.</p></section>';
  }
  const cards = domains.map(d =>
    '<div class="health-card"><strong>' + d.name + '</strong> <span style="color:var(--text-muted);font-size:12px">\u2014 ' + (d.files || 0) + ' files</span>' +
    '<div class="health-bar"><div class="health-fill" style="width:' + (d.healthScore || 0) + '%"></div></div></div>'
  ).join('');
  return '<section id="domains"><h2>Domains</h2>' + cards + '</section>';
}

function buildDiagramSection(diagramResult) {
  const d = diagramResult;
  return '<section id="diagram-' + d.type + '" class="diagram-section">' +
    '<div class="diagram-header">' +
    '<div><h2>' + d.title + '</h2><span class="type-badge">' + d.typeBadge + '</span></div>' +
    '<button class="expand-btn" onclick="openModal(\'' + d.type + '\')">&#x26F6; Expand</button>' +
    '</div>' +
    '<div class="diagram-container">' + d.svgContent + '</div>' +
    '<p class="diagram-note">' + d.note + '</p>' +
    '</section>';
}

function buildTechDebt(analysisData) {
  const items = (analysisData && analysisData.techDebt) || [];
  if (!items.length) {
    return '<section id="tech-debt"><h2>Tech Debt Register</h2><p style="color:var(--text-muted)">No tech debt items recorded.</p></section>';
  }
  const rows = items.map(i =>
    '<tr><td><span class="badge badge-' + i.severity + '">' + i.severity + '</span></td>' +
    '<td>' + (i.domain || '') + '</td><td>' + (i.issue || '') + '</td>' +
    '<td>' + (i.location || '') + '</td><td>' + (i.effort || '') + '</td></tr>'
  ).join('');
  return '<section id="tech-debt"><h2>Tech Debt Register</h2>' +
    '<table><thead><tr><th>Severity</th><th>Domain</th><th>Issue</th><th>Location</th><th>Effort</th></tr></thead>' +
    '<tbody>' + rows + '</tbody></table></section>';
}

function buildFindings(analysisData) {
  const findings = (analysisData && analysisData.findings) || [];
  if (!findings.length) {
    return '<section id="findings"><h2>Key Findings</h2><p style="color:var(--text-muted)">No findings recorded.</p></section>';
  }
  const cards = findings.map(f =>
    '<div class="finding-card">' +
    '<div class="finding-category">' + (f.category || 'General') + '</div>' +
    '<div class="finding-title">' + (f.title || '') + '</div>' +
    '<p>' + (f.description || '') + '</p>' +
    '<div class="finding-rec">' + (f.recommendation || '') + '</div>' +
    '</div>'
  ).join('');
  return '<section id="findings"><h2>Key Findings</h2>' + cards + '</section>';
}

module.exports = { buildMetricCards, buildDomainHealth, buildDiagramSection, buildTechDebt, buildFindings };
