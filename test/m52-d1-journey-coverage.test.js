'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const jc = require('../bin/journey-coverage.cjs');

function mkTmp() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'm52-jc-'));
  fs.mkdirSync(path.join(root, 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(root, 'e2e', 'viewer'), { recursive: true });
  fs.mkdirSync(path.join(root, '.gsd-t'), { recursive: true });
  return root;
}

function writeViewer(root, body) {
  const p = path.join(root, 'scripts', 'gsd-t-transcript.html');
  fs.writeFileSync(p, body, 'utf8');
  return p;
}

test('M52 D1 detector: no acorn/babel/esprima parser require', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'bin', 'journey-coverage.cjs'), 'utf8');
  assert.equal(/require\s*\(\s*['"]acorn['"]/.test(src), false);
  assert.equal(/require\s*\(\s*['"]@babel\/parser['"]/.test(src), false);
  assert.equal(/require\s*\(\s*['"]esprima['"]/.test(src), false);
});

test('M52 D1 detector: static addEventListener emits id:event selector', () => {
  const root = mkTmp();
  const body = `<script>
    const splitter = document.getElementById('splitter');
    splitter.addEventListener('mousedown', (ev) => {});
  </script>`;
  writeViewer(root, body);
  const ls = jc.detectListeners(['scripts/gsd-t-transcript.html'], { projectDir: root });
  const sel = ls.find((l) => l.selector === 'splitter:mousedown');
  assert.ok(sel, 'splitter:mousedown should be detected');
  assert.equal(sel.kind, 'addEventListener');
  assert.equal(sel.file, 'scripts/gsd-t-transcript.html');
});

test('M52 D1 detector: inline onclick attribute emits id:click', () => {
  const root = mkTmp();
  const body = `<button id="reportBtn" onclick="downloadReport()">Report</button>`;
  writeViewer(root, body);
  const ls = jc.detectListeners(['scripts/gsd-t-transcript.html'], { projectDir: root });
  const sel = ls.find((l) => l.selector === 'reportBtn:click');
  assert.ok(sel);
  assert.equal(sel.kind, 'inline-handler');
});

test('M52 D1 detector: inline onkeydown attribute emits id:keydown', () => {
  const root = mkTmp();
  const body = `<input id="search" onkeydown="onKey(event)" />`;
  writeViewer(root, body);
  const ls = jc.detectListeners(['scripts/gsd-t-transcript.html'], { projectDir: root });
  const sel = ls.find((l) => l.selector === 'search:keydown');
  assert.ok(sel);
  assert.equal(sel.kind, 'inline-handler');
});

test('M52 D1 detector: window.addEventListener("hashchange") emits hashchange kind', () => {
  const root = mkTmp();
  const body = `<script>window.addEventListener('hashchange', () => {});</script>`;
  writeViewer(root, body);
  const ls = jc.detectListeners(['scripts/gsd-t-transcript.html'], { projectDir: root });
  const sel = ls.find((l) => l.selector === 'window:hashchange');
  assert.ok(sel);
  assert.equal(sel.kind, 'hashchange');
});

test('M52 D1 detector: MutationObserver instantiation emits mutation-observer:<id>', () => {
  const root = mkTmp();
  const body = `<script>const mo = new MutationObserver(() => {});</script>`;
  writeViewer(root, body);
  const ls = jc.detectListeners(['scripts/gsd-t-transcript.html'], { projectDir: root });
  const sel = ls.find((l) => l.kind === 'mutation-observer');
  assert.ok(sel);
  assert.match(sel.selector, /^mutation-observer:gsd-t-transcript\.html:\d+$/);
});

test('M52 D1 detector: delegated handler with e.target.matches() emits delegated kind', () => {
  const root = mkTmp();
  const body = `<script>
    body.addEventListener('click', (e) => {
      if (e.target.matches('.kill-btn')) doKill();
    });
  </script>`;
  writeViewer(root, body);
  const ls = jc.detectListeners(['scripts/gsd-t-transcript.html'], { projectDir: root });
  const sel = ls.find((l) => l.kind === 'delegated');
  assert.ok(sel);
  assert.match(sel.selector, /^body:click/);
  assert.match(sel.selector, /\.kill-btn/);
});

test('M52 D1 detector: multiple events on same id emit distinct entries', () => {
  const root = mkTmp();
  const body = `<script>
    splitter.addEventListener('mousedown', () => {});
    splitter.addEventListener('keydown', () => {});
  </script>`;
  writeViewer(root, body);
  const ls = jc.detectListeners(['scripts/gsd-t-transcript.html'], { projectDir: root });
  assert.ok(ls.find((l) => l.selector === 'splitter:mousedown'));
  assert.ok(ls.find((l) => l.selector === 'splitter:keydown'));
});

test('M52 D1 detector: eslint-disable journey-coverage exempt comment is honored', () => {
  const root = mkTmp();
  const body = `<script>
    // eslint-disable-next-line journey-coverage internal-only:click
    internal.addEventListener('click', () => {});
  </script>`;
  writeViewer(root, body);
  const ls = jc.detectListeners(['scripts/gsd-t-transcript.html'], { projectDir: root });
  assert.equal(ls.find((l) => l.selector === 'internal:click'), undefined);
});

test('M52 D1 detector: feature-detect guard "if (!el.addEventListener) return" is ignored', () => {
  const root = mkTmp();
  const body = `<script>
    if (!splitter.addEventListener) return;
    splitter.addEventListener('mousedown', () => {});
  </script>`;
  writeViewer(root, body);
  const ls = jc.detectListeners(['scripts/gsd-t-transcript.html'], { projectDir: root });
  const downHits = ls.filter((l) => l.selector === 'splitter:mousedown');
  assert.equal(downHits.length, 1, 'guard line excluded; only the real binding counted');
});

test('M52 D1 loadManifest: missing manifest path throws MANIFEST_MISSING', () => {
  const root = mkTmp();
  let thrown;
  try { jc.loadManifest(root); } catch (e) { thrown = e; }
  assert.ok(thrown);
  assert.equal(thrown.code, 'MANIFEST_MISSING');
});

test('M52 D1 findGaps: stale manifest entry surfaces as STALE row', () => {
  const root = mkTmp();
  writeViewer(root, `<script>splitter.addEventListener('mousedown', () => {});</script>`);
  const listeners = jc.detectListeners(['scripts/gsd-t-transcript.html'], { projectDir: root });
  const manifest = {
    version: '0.1.0',
    specs: [
      { name: 'splitter-drag', spec: 'e2e/journeys/splitter-drag.spec.ts',
        covers: [{ file: 'scripts/gsd-t-transcript.html', selector: 'splitter:mousedown', kind: 'addEventListener' }] },
      { name: 'orphan', spec: 'e2e/journeys/orphan.spec.ts',
        covers: [{ file: 'scripts/gsd-t-transcript.html', selector: 'doesnotexist:click', kind: 'addEventListener' }] },
    ],
  };
  const gaps = jc.findGaps(listeners, manifest);
  const stale = gaps.find((g) => g.type === 'stale');
  assert.ok(stale);
  assert.equal(stale.selector, 'doesnotexist:click');
  const report = jc.formatReport(gaps);
  assert.match(report, /^STALE: spec=orphan/m);
});

test('M52 D1 findGaps: fresh manifest with full coverage yields no gaps', () => {
  const root = mkTmp();
  writeViewer(root, `<script>splitter.addEventListener('mousedown', () => {});</script>`);
  const listeners = jc.detectListeners(['scripts/gsd-t-transcript.html'], { projectDir: root });
  const manifest = {
    version: '0.1.0',
    specs: [
      { name: 'splitter-drag', spec: 'e2e/journeys/splitter-drag.spec.ts',
        covers: [{ file: 'scripts/gsd-t-transcript.html', selector: 'splitter:mousedown', kind: 'addEventListener' }] },
    ],
  };
  const gaps = jc.findGaps(listeners, manifest);
  assert.equal(gaps.length, 0);
});

test('M52 D1 detector: function-call without any call site is ignored (definition alone is not coverage)', () => {
  const root = mkTmp();
  const body = `<script>
    function connectMain(sessionId) { /* defined but never called */ }
  </script>`;
  writeViewer(root, body);
  const ls = jc.detectListeners(['scripts/gsd-t-transcript.html'], { projectDir: root });
  assert.equal(ls.find((l) => l.selector === 'connectMain'), undefined);
});

test('M52 D1 detector: addEventListener inside string literal is ignored', () => {
  const root = mkTmp();
  const body = `<script>
    const tip = "call .addEventListener('click', fn) to wire up";
    splitter.addEventListener('mousedown', () => {});
  </script>`;
  writeViewer(root, body);
  const ls = jc.detectListeners(['scripts/gsd-t-transcript.html'], { projectDir: root });
  const downs = ls.filter((l) => l.selector === 'splitter:mousedown');
  assert.equal(downs.length, 1);
  const stringHits = ls.filter((l) => /click/.test(l.selector) && l.line === 2);
  assert.equal(stringHits.length, 0);
});

test('M52 D1 detector: e2e/viewer/*.spec.ts files are ignored (M50/M51 scope)', () => {
  const root = mkTmp();
  const ignored = path.join(root, 'e2e', 'viewer', 'title.spec.ts');
  fs.writeFileSync(ignored, `body.addEventListener('click', () => {});`, 'utf8');
  const ls = jc.detectListeners(['e2e/viewer/title.spec.ts'], { projectDir: root });
  assert.equal(ls.length, 0);
});

test('M52 D1 detector: completes scan of viewer file in < 100ms', () => {
  const repoRoot = path.resolve(__dirname, '..');
  const viewer = path.join(repoRoot, 'scripts', 'gsd-t-transcript.html');
  if (!fs.existsSync(viewer)) {
    return;
  }
  const start = process.hrtime.bigint();
  const ls = jc.detectListeners(['scripts/gsd-t-transcript.html'], { projectDir: repoRoot });
  const elapsedNs = Number(process.hrtime.bigint() - start);
  const elapsedMs = elapsedNs / 1e6;
  assert.ok(ls.length > 0, 'should detect listeners in real viewer file');
  assert.ok(elapsedMs < 100, `expected < 100ms, got ${elapsedMs.toFixed(2)}ms`);
});
