'use strict';
const fs = require('fs');
const path = require('path');

function buildCss() {
  return `:root{--bg:#070b12;--surface:#0c1120;--card:#0f1624;--card2:#131c2e;--border:#1a2840;--border2:#243654;--blue:#3b82f6;--violet:#7c3aed;--cyan:#06b6d4;--green:#10b981;--amber:#f59e0b;--red:#ef4444;--orange:#f97316;--text:#e2e8f0;--muted:#4b6080;--muted2:#7a96b8;--radius:12px}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}html{scroll-behavior:smooth}
body{font-family:'Segoe UI',system-ui,sans-serif;background:var(--bg);color:var(--text);display:flex;min-height:100vh}
nav{width:192px;min-width:192px;background:var(--surface);border-right:1px solid var(--border);position:sticky;top:0;height:100vh;overflow-y:auto;padding:14px 0 24px;display:flex;flex-direction:column;gap:1px}
.nb{padding:0 12px 14px;border-bottom:1px solid var(--border);margin-bottom:6px}
.nb .pill{font-size:8.5px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;background:linear-gradient(135deg,var(--blue),var(--violet));color:#fff;padding:2px 7px;border-radius:4px;display:inline-block;margin-bottom:5px}
.nb h2{font-size:12.5px;font-weight:700}.nb p{font-size:10px;color:var(--muted2);margin-top:1px}
.ns{font-size:8.5px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;color:var(--muted);padding:10px 12px 3px;opacity:.55}
nav a{display:flex;align-items:center;gap:7px;padding:5px 12px;color:var(--muted2);text-decoration:none;font-size:11.5px;font-weight:500;border-left:2px solid transparent;transition:all .1s}
nav a:hover,nav a.active{color:var(--text);background:rgba(59,130,246,.07);border-left-color:var(--blue)}
.nd{width:5px;height:5px;border-radius:50%;background:var(--muted);flex-shrink:0;transition:background .1s}
nav a:hover .nd,nav a.active .nd{background:var(--blue)}.nd.g{background:var(--green)}.nd.y{background:var(--amber)}.nd.r{background:var(--red)}
main{flex:1;overflow-y:auto;padding:24px 36px 60px;min-width:0}
.ph{display:flex;align-items:baseline;justify-content:space-between;padding-bottom:14px;border-bottom:1px solid var(--border);margin-bottom:24px;flex-wrap:wrap;gap:6px}
.ph h1{font-size:15px;font-weight:700;display:flex;align-items:center;gap:8px}.ph h1 .bc{font-size:10px;font-weight:400;color:var(--muted2)}
.ph .meta{font-size:10.5px;color:var(--muted2);display:flex;gap:12px;flex-wrap:wrap}.ph .meta .sep{color:var(--border2)}
section{margin-bottom:44px;scroll-margin-top:20px}
.sl{font-size:9px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;color:var(--muted2);margin-bottom:12px;display:flex;align-items:center;gap:8px}
.sl::after{content:'';flex:1;height:1px;background:var(--border)}
.mxg{display:grid;grid-template-columns:repeat(auto-fit,minmax(138px,1fr));gap:10px}
.mc{background:var(--card);border:1px solid var(--border);border-radius:10px;padding:14px 16px;overflow:hidden;position:relative}
.mc-bar{height:2px;border-radius:1px;margin-bottom:10px;background:linear-gradient(90deg,var(--blue),var(--violet))}
.mc-bar.g{background:linear-gradient(90deg,var(--green),#34d399)}.mc-bar.y{background:linear-gradient(90deg,var(--amber),#fbbf24)}.mc-bar.r{background:linear-gradient(90deg,var(--red),#f87171)}.mc-bar.o{background:linear-gradient(90deg,var(--orange),#fb923c)}
.mc-lbl{font-size:9px;font-weight:800;letter-spacing:.7px;text-transform:uppercase;color:var(--muted2);margin-bottom:4px}.mc-val{font-size:24px;font-weight:800;color:var(--text);line-height:1}.mc-sub{font-size:9.5px;color:var(--muted2);margin-top:3px}
.dc{background:var(--card);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;margin-bottom:16px;transition:border-color .15s}
.dc:hover{border-color:var(--border2)}.dc-h{display:flex;align-items:center;justify-content:space-between;padding:9px 14px;background:var(--card2);border-bottom:1px solid var(--border)}
.dc-hl{display:flex;align-items:center;gap:8px}.dc-t{font-size:11.5px;font-weight:700;color:var(--text)}
.dc-tag{font-size:8.5px;font-weight:800;letter-spacing:.8px;text-transform:uppercase;padding:2px 8px;border-radius:20px;background:rgba(59,130,246,.1);color:var(--blue);border:1px solid rgba(59,130,246,.2)}
.btn-exp{display:flex;align-items:center;gap:5px;background:rgba(255,255,255,.04);border:1px solid var(--border2);border-radius:6px;color:var(--muted2);cursor:pointer;padding:4px 10px;font-size:12px;transition:all .15s}
.btn-exp span.lbl{font-size:9px;font-weight:700;letter-spacing:.5px;text-transform:uppercase}.btn-exp:hover{background:rgba(59,130,246,.12);border-color:var(--blue);color:var(--blue)}
.dc-b{min-height:520px;display:flex;align-items:flex-start;justify-content:center;background:radial-gradient(ellipse 80% 60% at 50% 20%,rgba(59,130,246,.04) 0%,transparent 70%),var(--bg);padding:24px 20px;overflow:auto}
.dc-b .mermaid{width:100%;display:flex;align-items:flex-start;justify-content:center}.dc-b .mermaid svg{width:100%!important;height:auto!important;display:block}
.dc-b svg{width:100%;height:auto;display:block}
.diagram-placeholder{background:rgba(255,255,255,.03);border:1px dashed var(--border);border-radius:8px;padding:48px 32px;text-align:center;color:var(--muted2);font-size:13px;width:100%}
.diagram-placeholder code{font-family:monospace;background:rgba(255,255,255,.07);padding:2px 6px;border-radius:4px}
.dc-n{padding:9px 14px;font-size:11px;color:var(--muted2);border-top:1px solid var(--border);background:var(--card2);line-height:1.5}
.dc-n strong{color:var(--text)}.dc-n code{font-family:'Consolas',monospace;font-size:10px;background:rgba(255,255,255,.05);padding:1px 5px;border-radius:3px;color:#7dd3fc}
.tw{background:var(--card);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden}
table{width:100%;border-collapse:collapse;font-size:12px}
thead th{background:var(--card2);color:var(--muted2);font-size:8.5px;font-weight:800;letter-spacing:1px;text-transform:uppercase;padding:9px 13px;text-align:left;border-bottom:1px solid var(--border)}
tbody td{padding:9px 13px;border-bottom:1px solid var(--border);vertical-align:top}
tbody tr:last-child td{border-bottom:none}tbody tr:hover{background:rgba(255,255,255,.012)}
td code{font-family:'Consolas',monospace;font-size:10px;background:rgba(255,255,255,.05);padding:1px 5px;border-radius:3px;color:#7dd3fc}
.loc-cell{font-family:'Consolas',monospace;font-size:11px;color:var(--blue);white-space:nowrap}
.bx{display:inline-flex;align-items:center;padding:2px 7px;border-radius:20px;font-size:8.5px;font-weight:800;letter-spacing:.4px;text-transform:uppercase}
.bx.c{background:rgba(239,68,68,.1);color:var(--red);border:1px solid rgba(239,68,68,.22)}.bx.h{background:rgba(249,115,22,.1);color:var(--orange);border:1px solid rgba(249,115,22,.22)}
.bx.m{background:rgba(245,158,11,.1);color:var(--amber);border:1px solid rgba(245,158,11,.22)}.bx.l{background:rgba(16,185,129,.1);color:var(--green);border:1px solid rgba(16,185,129,.22)}
.bx.i{background:rgba(59,130,246,.1);color:var(--blue);border:1px solid rgba(59,130,246,.22)}
.fl{display:flex;flex-direction:column;gap:8px}
.fi{background:var(--card);border:1px solid var(--border);border-radius:10px;padding:13px 14px;display:flex;gap:11px;align-items:flex-start}
.fi .ico{font-size:15px;flex-shrink:0;margin-top:1px}.fi h4{font-size:11.5px;font-weight:700;margin-bottom:2px}.fi p{font-size:11px;color:var(--muted2)}
.fi code{font-family:'Consolas',monospace;font-size:10px;background:rgba(255,255,255,.05);padding:1px 5px;border-radius:3px;color:#7dd3fc}
#modal{display:none;position:fixed;inset:0;background:rgba(4,7,14,.97);z-index:1000;flex-direction:column}#modal.open{display:flex}
.mbar{display:flex;align-items:center;justify-content:space-between;padding:10px 18px;background:rgba(12,17,32,.98);border-bottom:1px solid var(--border);backdrop-filter:blur(8px);flex-shrink:0}
.mbar h3{font-size:12.5px;font-weight:700}.mbar .hint{font-size:9.5px;color:var(--muted2);margin-left:10px}.mbar-r{display:flex;align-items:center;gap:8px}
.btn-z{background:rgba(255,255,255,.05);border:1px solid var(--border2);border-radius:6px;color:var(--muted2);cursor:pointer;padding:4px 10px;font-size:13px;font-weight:700;transition:all .12s}
.btn-z:hover{background:rgba(59,130,246,.12);border-color:var(--blue);color:var(--blue)}.zlbl{font-size:10.5px;color:var(--muted2);min-width:36px;text-align:center}
.btn-cls{background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.2);border-radius:7px;color:#f87171;cursor:pointer;padding:5px 14px;font-size:12px;font-weight:600;transition:all .12s}
.btn-cls:hover{background:rgba(239,68,68,.2);border-color:var(--red)}
#mcontent{flex:1;overflow:auto;display:flex;align-items:center;justify-content:center;padding:48px}
#mdiagram{transform-origin:center center;transition:transform .12s}#mdiagram svg{display:block;width:auto;max-width:100%;height:auto}
footer{margin-top:48px;padding-top:14px;border-top:1px solid var(--border);font-size:9.5px;color:var(--muted);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:5px;opacity:.5}
footer a{color:var(--muted2);text-decoration:none}footer a:hover{color:var(--blue)}
::-webkit-scrollbar{width:4px;height:4px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:var(--border2);border-radius:4px}`;
}

function buildScript() {
  return `<script>
mermaid.initialize({startOnLoad:false,theme:'dark',themeVariables:{darkMode:true,background:'#070b12',mainBkg:'#0f1624',primaryColor:'#0f1d3a',primaryTextColor:'#e2e8f0',primaryBorderColor:'#3b82f6',secondaryColor:'#1a0f3a',secondaryTextColor:'#e2e8f0',secondaryBorderColor:'#7c3aed',tertiaryColor:'#0a2318',tertiaryTextColor:'#e2e8f0',tertiaryBorderColor:'#10b981',lineColor:'#3b82f6',textColor:'#e2e8f0',fontSize:'14px',edgeLabelBackground:'#0c1120',clusterBkg:'#080e1a',clusterBorder:'#1a2840',titleColor:'#94a3b8',actorBkg:'#0f1d3a',actorBorder:'#3b82f6',actorTextColor:'#bfdbfe',actorLineColor:'#1a2840',signalColor:'#60a5fa',signalTextColor:'#e2e8f0',activationBkgColor:'#1a0f3a',activationBorderColor:'#7c3aed',sequenceNumberColor:'#070b12',labelBoxBkgColor:'#0f1d3a',labelBoxBorderColor:'#3b82f6',labelTextColor:'#bfdbfe',loopTextColor:'#bfdbfe',noteBkgColor:'#1f1505',noteTextColor:'#fde68a',noteBorderColor:'#f59e0b',attributeBackgroundColorOdd:'#0f1624',attributeBackgroundColorEven:'#0c1120'},flowchart:{curve:'basis',padding:28,nodeSpacing:55,rankSpacing:65,htmlLabels:true},sequence:{actorMargin:80,messageMargin:35,useMaxWidth:true,mirrorActors:false,boxMargin:12},er:{useMaxWidth:true,layoutDirection:'TB',minEntityWidth:120,entityPadding:18},state:{useMaxWidth:true}});
document.addEventListener('DOMContentLoaded',async()=>{try{await mermaid.run({querySelector:'.mermaid'});}catch(e){console.warn('Mermaid render error:',e);}document.querySelectorAll('.dc-b .mermaid svg').forEach(svg=>{svg.removeAttribute('width');svg.removeAttribute('height');svg.style.width='100%';svg.style.height='auto';svg.style.display='block';svg.style.minHeight='420px';});});
let zoom=1;
function expandDiagram(btn){const card=btn.closest('.dc');const title=card.dataset.title||'Diagram';const svg=card.querySelector('.dc-b svg');if(!svg)return;const clone=svg.cloneNode(true);clone.style.cssText='display:block;width:auto;height:auto;max-width:90vw;max-height:85vh;';clone.removeAttribute('width');clone.removeAttribute('height');const wrap=document.getElementById('mdiagram');wrap.innerHTML='';wrap.appendChild(clone);document.getElementById('mtitle').textContent=title;zoom=1;applyZoom();document.getElementById('modal').classList.add('open');document.body.style.overflow='hidden';}
function closeModal(){document.getElementById('modal').classList.remove('open');document.body.style.overflow='';}
function adjustZoom(d){zoom=Math.max(0.2,Math.min(5,zoom+d));applyZoom();}
function resetZoom(){zoom=1;applyZoom();}
function applyZoom(){document.getElementById('mdiagram').style.transform='scale('+zoom+')';document.getElementById('zlbl').textContent=Math.round(zoom*100)+'%';}
document.getElementById('mcontent').addEventListener('wheel',e=>{e.preventDefault();adjustZoom(e.deltaY<0?0.06:-0.06);},{passive:false});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal();});
document.getElementById('modal').addEventListener('click',e=>{if(e.target===document.getElementById('modal')||e.target===document.getElementById('mcontent'))closeModal();});
const navLinks=document.querySelectorAll('nav a[href^="#"]');document.querySelectorAll('section[id]').forEach(s=>new IntersectionObserver(entries=>{if(entries[0].isIntersecting){navLinks.forEach(l=>l.classList.remove('active'));const a=document.querySelector('nav a[href="#'+entries[0].target.id+'"]');if(a)a.classList.add('active');}},{threshold:0.15}).observe(s));
<\/script>`;
}

function buildSidebar(projectName, version, scanDate, diagTypes) {
  const vp = (version ? esc(version) + ' &middot; ' : '') + esc(scanDate || '');
  const ALL = [['system-architecture','System Architecture'],['app-architecture','App Architecture'],['workflow','Workflow'],['data-flow','Data Flow'],['sequence','Sequence'],['database-schema','Database Schema']];
  const dlinks = ALL.filter(([t]) => !diagTypes || diagTypes.includes(t)).map(([t, l]) => '<a href="#diagram-' + t + '"><span class="nd"></span>' + esc(l) + '</a>').join('\n  ');
  return '<nav>\n  <div class="nb"><div class="pill">GSD&#x2011;T Scan</div><h2>' + esc(projectName) + '</h2><p>' + vp + '</p></div>\n  <div class="ns">Overview</div>\n  <a href="#summary"><span class="nd g"></span>Summary</a>\n  <a href="#domains"><span class="nd"></span>Domains</a>\n  <div class="ns">Diagrams</div>\n  ' + dlinks + '\n  <div class="ns">Analysis</div>\n  <a href="#tech-debt"><span class="nd y"></span>Tech Debt</a>\n  <a href="#findings"><span class="nd r"></span>Key Findings</a>\n</nav>';
}

function buildPageHeader(data, opts) {
  const projectName = data.projectName || path.basename(opts.projectRoot || process.cwd());
  const stack = data.techStack || '';
  const files = data.filesScanned ? data.filesScanned + ' files' : '';
  const loc = data.totalLoc ? (data.totalLoc > 999 ? (data.totalLoc / 1000).toFixed(1) + 'k' : data.totalLoc) + ' LoC' : '';
  const fileLoc = [files, loc].filter(Boolean).join(' \u00b7 ');
  const metaParts = [stack, fileLoc, data.scanDate || ''].filter(Boolean);
  const metaHtml = metaParts.map((m, i) =>
    (i > 0 ? '<span class="sep">|</span>' : '') + '<span>' + esc(m) + '</span>'
  ).join('');
  return '<div class="ph"><h1><span class="bc">GSD&#x2011;T &rsaquo; Scan &rsaquo;</span> ' +
    esc(projectName) + ' Codebase Report</h1><div class="meta">' + metaHtml + '</div></div>';
}

function buildHtmlSkeleton(title, css, sidebar, body) {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${title}</title>
<script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"><\/script>
<style>
${css}
</style></head>
<body>
${sidebar}
<div id="modal">
  <div class="mbar">
    <div style="display:flex;align-items:center;gap:8px"><h3 id="mtitle">Diagram</h3><span class="hint">Scroll to zoom &middot; Esc to close</span></div>
    <div class="mbar-r">
      <button class="btn-z" onclick="adjustZoom(-0.15)">&#8722;</button>
      <span class="zlbl" id="zlbl">100%</span>
      <button class="btn-z" onclick="adjustZoom(0.15)">+</button>
      <button class="btn-z" onclick="resetZoom()" style="font-size:10px;padding:4px 9px">Reset</button>
      <button class="btn-cls" onclick="closeModal()">&#10005; Close</button>
    </div>
  </div>
  <div id="mcontent"><div id="mdiagram"></div></div>
</div>
<main>
${body}
<footer><span>GSD-T Scan Report</span><span><a href="https://mermaid.js.org">Mermaid.js (MIT)</a></span></footer>
</main>
${buildScript()}
</body>
</html>`;
}

function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
const sections = require('./scan-report-sections.js');
function generateReport(analysisData, schemaData, diagrams, options) {
  try {
    const safeData = analysisData || {};
    const safeDiagrams = (Array.isArray(diagrams) ? diagrams : []).filter(d => d.mmdSource || d.rendered);
    const opts = options || {};
    const projectName = safeData.projectName || path.basename(opts.projectRoot || process.cwd());
    const css = buildCss();
    const sidebar = buildSidebar(projectName, safeData.version || '', safeData.scanDate || '', safeDiagrams.map(d => d.type));
    const pageHeader = buildPageHeader(safeData, opts);
    const body = pageHeader
      + sections.buildMetricCards(safeData)
      + sections.buildDomainHealth(safeData)
      + safeDiagrams.map(sections.buildDiagramSection).join('')
      + sections.buildTechDebt(safeData)
      + sections.buildFindings(safeData);
    const html = buildHtmlSkeleton(esc(projectName) + ' \u2014 GSD-T Scan Report', css, sidebar, body);
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
