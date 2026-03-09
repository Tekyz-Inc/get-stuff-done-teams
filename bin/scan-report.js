'use strict';
const fs = require('fs');
const path = require('path');

function buildCss() {
  return `:root{--bg:#0d1117;--card-bg:#161b22;--sidebar-bg:#0d1117;--accent:#58a6ff;--text:#c9d1d9;--border:#30363d;--text-muted:#8b949e}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px}
#sidebar{position:fixed;left:0;top:0;width:240px;height:100vh;overflow-y:auto;background:var(--sidebar-bg);border-right:1px solid var(--border);padding:16px 0}
#sidebar h3{color:var(--text-muted);font-size:11px;text-transform:uppercase;letter-spacing:.08em;padding:0 16px 8px}
#sidebar ul{list-style:none}
#sidebar ul li a{display:block;padding:6px 16px;color:var(--text-muted);text-decoration:none;font-size:13px}
#sidebar ul li a:hover,#sidebar ul li a.active{color:var(--accent);background:rgba(88,166,255,.08)}
main{margin-left:240px;padding:24px;max-width:1200px}
h1{font-size:22px;margin-bottom:4px}
h2{font-size:16px;color:var(--text);margin-bottom:16px}
section{margin-bottom:40px;padding-top:8px}
.metric-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:24px}
.metric-card{background:var(--card-bg);border:1px solid var(--border);border-radius:8px;padding:16px}
.metric-card .label{color:var(--text-muted);font-size:12px;margin-bottom:4px}
.metric-card .value{font-size:24px;font-weight:600;color:var(--accent)}
.health-card{background:var(--card-bg);border:1px solid var(--border);border-radius:8px;padding:16px;margin-bottom:12px}
.health-bar{background:var(--border);border-radius:4px;height:8px;margin-top:8px}
.health-fill{background:var(--accent);border-radius:4px;height:8px}
.diagram-section{background:var(--card-bg);border:1px solid var(--border);border-radius:8px;padding:20px;margin-bottom:24px}
.diagram-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px}
.type-badge{background:rgba(88,166,255,.15);color:var(--accent);border-radius:4px;padding:2px 8px;font-size:11px;font-family:monospace}
.diagram-container{min-height:200px}
.diagram-container svg{width:100%;height:auto;display:block}
.diagram-placeholder{background:rgba(255,255,255,.03);border:1px dashed var(--border);border-radius:6px;padding:32px;text-align:center;color:var(--text-muted)}
.diagram-note{font-size:12px;color:var(--text-muted);margin-top:12px;font-style:italic}
.expand-btn{background:none;border:1px solid var(--border);color:var(--text-muted);border-radius:4px;padding:4px 10px;font-size:12px;cursor:pointer}
.expand-btn:hover{border-color:var(--accent);color:var(--accent)}
table{width:100%;border-collapse:collapse;font-size:13px}
th{text-align:left;padding:8px 12px;border-bottom:1px solid var(--border);color:var(--text-muted);font-weight:500}
td{padding:8px 12px;border-bottom:1px solid rgba(48,54,61,.5)}
.badge{border-radius:4px;padding:2px 8px;font-size:11px;font-weight:600}
.badge-critical{color:#f85149}.badge-high{color:#d29922}.badge-medium{color:#e3b341}.badge-low{color:#58a6ff}
.file-path{font-family:monospace;font-size:12px;color:var(--text-muted)}
.loc-cell{font-family:monospace;font-size:12px;color:var(--accent);white-space:nowrap}
.finding-card{background:var(--card-bg);border:1px solid var(--border);border-left:4px solid var(--border);border-radius:8px;padding:20px;margin-bottom:14px}
.finding-header{display:flex;align-items:center;gap:8px;margin-bottom:10px}
.sev-badge{border-radius:4px;padding:2px 8px;font-size:10px;font-weight:700;letter-spacing:.06em}
.finding-cat{color:var(--text-muted);font-size:11px;text-transform:uppercase;letter-spacing:.08em}
.finding-title{font-size:14px;font-weight:600;margin-bottom:10px;line-height:1.4}
.finding-desc{font-size:13px;color:var(--text-muted);line-height:1.65;margin-bottom:12px}
.finding-rec{background:rgba(88,166,255,.06);border-left:3px solid var(--accent);border-radius:0 4px 4px 0;padding:10px 14px;font-size:13px;color:var(--text);line-height:1.55}
.rec-label{display:block;font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:var(--accent);margin-bottom:5px;font-weight:600}
#modal{display:none;position:fixed;inset:0;background:rgba(0,0,0,.9);z-index:1000;overflow:auto;padding:20px}
#modal-content{background:var(--card-bg);border:1px solid var(--border);border-radius:8px;padding:20px;max-width:1400px;margin:0 auto}
#modal-close{float:right;background:none;border:1px solid var(--border);color:var(--text);border-radius:4px;padding:4px 12px;cursor:pointer}`;
}

function buildScrollspyScript() {
  return '<script>const observer=new IntersectionObserver(entries=>{entries.forEach(e=>{const id=e.target.id;const link=document.querySelector(\'#sidebar a[href="#\'+id+\'"]\');if(link)link.classList.toggle(\'active\',e.isIntersecting);});},{threshold:0.3});document.querySelectorAll(\'section[id]\').forEach(s=>observer.observe(s));<\/script>';
}

function buildSidebar(sections) {
  const links = sections.map(s => '<li><a href="#' + s.id + '">' + s.label + '</a></li>').join('');
  return '<nav id="sidebar"><h3>GSD-T Scan Report</h3><ul>' + links + '</ul></nav>' + buildScrollspyScript();
}

function buildModalScript() {
  return '<script>function openModal(t){const dc=document.querySelector(\'#diagram-\'+t+\' .diagram-container\');const mc=document.getElementById(\'modal-content\');if(dc&&mc){mc.innerHTML=\'<button id="modal-close" onclick="closeModal()">&#x2715; Close<\/button>\'+dc.innerHTML;}document.getElementById(\'modal\').style.display=\'block\';}function closeModal(){document.getElementById(\'modal\').style.display=\'none\';}document.addEventListener(\'keydown\',e=>{if(e.key===\'Escape\')closeModal();});document.getElementById(\'modal\').addEventListener(\'wheel\',function(e){const svgs=this.querySelectorAll(\'svg\');if(!svgs.length)return;e.preventDefault();svgs.forEach(svg=>{const curr=parseFloat(svg.style.width)||100;svg.style.width=Math.max(50,Math.min(300,curr-e.deltaY*0.1)+\'%\');});},{passive:false});<\/script>';
}

function buildHtmlSkeleton(title, css, sidebar, body) {
  return '<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width,initial-scale=1.0">\n<title>' + title + '</title>\n<style>\n' + css + '\n</style>\n</head>\n<body>\n' + sidebar + '\n<main>\n' + body + '\n</main>\n<div id="modal"><div id="modal-content"></div></div>\n' + buildModalScript() + '\n</body>\n</html>';
}

const sections = require('./scan-report-sections.js');

function generateReport(analysisData, schemaData, diagrams, options) {
  try {
    const safeData = analysisData || {};
    const safeDiagrams = Array.isArray(diagrams) ? diagrams : [];
    const opts = options || {};
    const css = buildCss();
    const navSections = [
      { id: 'summary', label: 'Summary' },
      { id: 'domains', label: 'Domains' },
      { id: 'diagram-system-architecture', label: 'System Architecture' },
      { id: 'diagram-app-architecture', label: 'App Architecture' },
      { id: 'diagram-workflow', label: 'Workflow' },
      { id: 'diagram-data-flow', label: 'Data Flow' },
      { id: 'diagram-sequence', label: 'Sequence' },
      { id: 'diagram-database-schema', label: 'Database Schema' },
      { id: 'tech-debt', label: 'Tech Debt' },
      { id: 'findings', label: 'Key Findings' }
    ];
    const sidebar = buildSidebar(navSections);
    const body = sections.buildMetricCards(safeData)
      + sections.buildDomainHealth(safeData)
      + safeDiagrams.map(sections.buildDiagramSection).join('')
      + sections.buildTechDebt(safeData)
      + sections.buildFindings(safeData);
    const projectName = safeData.projectName || path.basename(opts.projectRoot || process.cwd());
    const html = buildHtmlSkeleton(projectName + ' \u2014 GSD-T Scan Report', css, sidebar, body);
    const outputPath = path.join(opts.outputDir || opts.projectRoot || process.cwd(), 'scan-report.html');
    fs.writeFileSync(outputPath, html, 'utf8');
    return {
      outputPath,
      diagramsRendered: safeDiagrams.filter(d => d.rendered).length,
      diagramsPlaceholder: safeDiagrams.filter(d => !d.rendered).length
    };
  } catch (err) {
    process.stderr.write('scan-report error: ' + err.message + '\n');
    return { outputPath: null, error: err.message };
  }
}

module.exports = {
  generateReport,
  buildCss,
  buildSidebar,
  buildHtmlSkeleton,
  buildMetricCards: sections.buildMetricCards,
  buildDomainHealth: sections.buildDomainHealth,
  buildDiagramSection: sections.buildDiagramSection,
  buildTechDebt: sections.buildTechDebt,
  buildFindings: sections.buildFindings
};
