'use strict';

/**
 * M48 — viewer rendering regressions (post-M47):
 *   Bug 1: header/title hardcoded; should be project basename.
 *   Bug 2: frame timestamps all identical in a batch; must parse frame.ts.
 *   Bug 3: frames render as raw JSON dumps; user_turn/assistant_turn/session_start
 *          must render as chat bubbles.
 *   Bug 4: top + bottom panes show identical content when an in-session
 *          rail entry is clicked; bottom pane must stay on the selected spawn.
 *
 * Static HTML inspection for bugs 2/3/4 (mirrors the M44/M45 D2 test style).
 * Bug 1 also verifies via a real HTTP request to the dashboard server so the
 * server-side substitution path is exercised end-to-end.
 */

const { describe, it } = require('node:test');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const os = require('node:os');

const srv = require('../scripts/gsd-t-dashboard-server.js');

const HTML_PATH = path.join(__dirname, '..', 'scripts', 'gsd-t-transcript.html');
function readHtml() { return fs.readFileSync(HTML_PATH, 'utf8'); }

// ── Bug 1 — header/title is project basename ─────────────────────────────────

describe('M48 Bug 1 — header/title is the project basename', () => {
  it('HTML ships with __PROJECT_NAME__ placeholders in <title> and the .title div', () => {
    const html = readHtml();
    assert.match(html, /<title>__PROJECT_NAME__<\/title>/, 'title tag must use __PROJECT_NAME__ placeholder');
    assert.match(html, /<div class="title">__PROJECT_NAME__<\/div>/, 'header .title div must use __PROJECT_NAME__ placeholder');
    assert.doesNotMatch(html, /<title>GSD-T Transcript<\/title>/, 'literal "GSD-T Transcript" must not be hardcoded in <title>');
    assert.doesNotMatch(html, /<div class="title">GSD-T Transcript<\/div>/, 'literal "GSD-T Transcript" must not be hardcoded in header');
  });

  function withServer(projDirName, fn) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `gsdt-m48-bug1-`));
    // Create a child dir with the EXACT name we want as the project basename.
    const projRoot = path.join(tmp, projDirName);
    fs.mkdirSync(path.join(projRoot, '.gsd-t', 'events'), { recursive: true });
    fs.mkdirSync(path.join(projRoot, '.gsd-t', 'transcripts'), { recursive: true });
    const dashHtmlPath = path.join(__dirname, '..', 'scripts', 'gsd-t-dashboard.html');
    const transcriptHtmlPath = path.join(__dirname, '..', 'scripts', 'gsd-t-transcript.html');
    const { server } = srv.startServer(0, path.join(projRoot, '.gsd-t', 'events'), dashHtmlPath, projRoot, transcriptHtmlPath);
    const port = server.address().port;
    return Promise.resolve(fn(port)).finally(() => {
      server.close();
      fs.rmSync(tmp, { recursive: true, force: true });
    });
  }

  function fetchHtml(port, urlPath) {
    return new Promise((resolve, reject) => {
      http.get({ host: 'localhost', port, path: urlPath, headers: { accept: 'text/html' } }, (res) => {
        let body = '';
        res.on('data', (c) => body += c);
        res.on('end', () => resolve({ status: res.statusCode, body }));
      }).on('error', reject);
    });
  }

  it('GET /transcripts substitutes __PROJECT_NAME__ with the project basename', async () => {
    await withServer('Move-Zoom-Recordings-to-GDrive', async (port) => {
      const r = await fetchHtml(port, '/transcripts');
      assert.equal(r.status, 200);
      assert.match(r.body, /<title>Move-Zoom-Recordings-to-GDrive<\/title>/);
      assert.match(r.body, /<div class="title">Move-Zoom-Recordings-to-GDrive<\/div>/);
      assert.doesNotMatch(r.body, /__PROJECT_NAME__/, 'placeholder must be fully substituted');
    });
  });

  it('GET /transcript/:spawnId substitutes __PROJECT_NAME__ with the project basename', async () => {
    await withServer('GSD-T', async (port) => {
      // Use a syntactically valid spawn id (isValidSpawnId guards path traversal).
      const r = await fetchHtml(port, '/transcript/probe-abc123');
      assert.equal(r.status, 200);
      assert.match(r.body, /<title>GSD-T<\/title>/);
      assert.match(r.body, /<div class="title">GSD-T<\/div>/);
      assert.doesNotMatch(r.body, /__PROJECT_NAME__/);
    });
  });

  it('escapes HTML special characters in the project basename', async () => {
    // Directory names with `<`, `&`, etc. are rare but legal on POSIX.
    await withServer('weird&<dir>', async (port) => {
      const r = await fetchHtml(port, '/transcripts');
      assert.equal(r.status, 200);
      assert.match(r.body, /<title>weird&amp;&lt;dir&gt;<\/title>/, 'special chars must be HTML-escaped');
    });
  });

  it('regression — `$&`, `$1`, `$$` in basename do not corrupt the rendered title (Red Team BUG-1)', async () => {
    // String.prototype.replace with a string replacement interprets `$&`
    // and similar as backreferences. We must use function-form replacement.
    // POSIX allows `$` in directory names, so this is a real exposure.
    // Note: `&` then HTML-escapes to `&amp;` — that's the correct flow,
    // what we're guarding is the placeholder being re-injected.
    await withServer('proj-$&-x', async (port) => {
      const r = await fetchHtml(port, '/transcripts');
      assert.equal(r.status, 200);
      // After HTML-escape: `proj-$&-x` → `proj-$&amp;-x`. The `$` MUST
      // remain literal (not interpreted as `$&` backreference).
      assert.match(r.body, /<title>proj-\$&amp;-x<\/title>/, '`$&` must be preserved literally, not interpreted as a backreference');
      assert.doesNotMatch(r.body, /__PROJECT_NAME__/, 'placeholder must not leak back into the output');
    });
  });

  it('regression — `$1`/`$$` patterns also preserved (handleTranscriptPage)', async () => {
    await withServer('a$1b', async (port) => {
      const r = await fetchHtml(port, '/transcript/probe-abc123');
      assert.equal(r.status, 200);
      // No `&`/`<`/`>` in basename → no HTML escaping needed; `$1` is HTML-inert.
      assert.match(r.body, /<title>a\$1b<\/title>/);
      assert.doesNotMatch(r.body, /__PROJECT_NAME__/);
    });
  });
});

// ── Bug 2 — per-frame timestamp parsing ──────────────────────────────────────

describe('M48 Bug 2 — frame.ts is preferred over arrival time', () => {
  it('defines a frameTs(frame, fallback) helper', () => {
    const html = readHtml();
    assert.match(html, /function frameTs\(\s*frame\s*,\s*fallback\s*\)\s*\{/);
    // Window-scope export so test/JSDOM harnesses can call it directly.
    assert.match(html, /window\.__gsdtFrameTs\s*=\s*frameTs/);
  });

  it('frameTs returns a Date parsed from frame.ts when present and valid', () => {
    const html = readHtml();
    // The body must construct `new Date(frame.ts)` and validate via getTime().
    assert.match(html, /new Date\(frame\.ts\)/);
    assert.match(html, /isNaN\(d\.getTime\(\)\)/);
  });

  it('connect()/connectMain() pass frameTs(frame, arrivedAt) to renderFrame', () => {
    const html = readHtml();
    // Both SSE handlers must thread the per-frame timestamp through, not
    // hand the SSE arrivedAt directly to renderFrame anymore.
    const calls = html.match(/frameTs\(\s*frame\s*,\s*arrivedAt\s*\)/g) || [];
    assert.ok(calls.length >= 2, `expected >=2 frameTs(frame, arrivedAt) sites, got ${calls.length}`);
    // And renderFrame gets called with the derived `renderAt`, not `arrivedAt`.
    assert.match(html, /renderFrame\(\s*frame\s*,\s*renderAt\s*\)/);
    assert.match(html, /renderFrame\(\s*frame\s*,\s*renderAt\s*,\s*mainStreamEl\s*\)/);
  });

  it('renderFrameInner falls back to frameTs(frame) when arrivedAt is invalid', () => {
    const html = readHtml();
    // The defensive guard inside renderFrameInner.
    assert.match(html, /arrivedAt instanceof Date[\s\S]*?frameTs\(frame, new Date\(\)\)/);
  });
});

// ── Bug 3 — chat-bubble formatting for in-session conversation frames ────────

describe('M48 Bug 3 — user_turn / assistant_turn / session_start render as chat bubbles', () => {
  it('defines render helpers for all four conversation frame types', () => {
    const html = readHtml();
    assert.match(html, /function renderUserTurn\(/);
    assert.match(html, /function renderAssistantTurn\(/);
    assert.match(html, /function renderSessionStart\(/);
    assert.match(html, /function renderToolUseLine\(/);
  });

  it('exposes the helpers on window for tests / external callers', () => {
    const html = readHtml();
    assert.match(html, /window\.__gsdtRenderUserTurn\s*=\s*renderUserTurn/);
    assert.match(html, /window\.__gsdtRenderAssistantTurn\s*=\s*renderAssistantTurn/);
    assert.match(html, /window\.__gsdtRenderSessionStart\s*=\s*renderSessionStart/);
  });

  it('dispatches by frame.type in renderFrameInner', () => {
    const html = readHtml();
    assert.match(html, /type === 'session_start'\)\s*\{\s*renderSessionStart/);
    assert.match(html, /type === 'user_turn'\)\s*\{\s*renderUserTurn/);
    assert.match(html, /type === 'assistant_turn'\)\s*\{\s*renderAssistantTurn/);
    assert.match(html, /type === 'tool_use'\)\s*\{\s*renderToolUseLine/);
  });

  it('does NOT fall through to JSON.stringify for known conversation types', () => {
    // The dispatch arms above must short-circuit BEFORE the trailing
    // `renderRaw(JSON.stringify(frame), ts)` line at the bottom of
    // renderFrameInner. We assert dispatch comes before that fallback.
    const html = readHtml();
    // Slice from the start of renderFrameInner to the next top-level `}\n`
    // followed by `\n      // ` (next comment) or another `function `.
    const start = html.indexOf('function renderFrameInner(');
    assert.ok(start > 0, 'renderFrameInner located');
    const after = html.slice(start);
    const block = after.slice(0, after.indexOf('\n      // ── Sidebar')); // up to sidebar section
    assert.ok(block.length > 100, 'renderFrameInner body extracted');
    const userTurnIdx = block.indexOf("type === 'user_turn'");
    const fallbackIdx = block.indexOf('renderRaw(JSON.stringify(frame), ts)');
    assert.ok(userTurnIdx > 0, 'user_turn dispatch present');
    assert.ok(fallbackIdx > 0, 'JSON.stringify fallback present');
    assert.ok(userTurnIdx < fallbackIdx, 'user_turn dispatch must come before the JSON.stringify fallback');
  });

  it('CSS rules for the new bubble types are defined', () => {
    const html = readHtml();
    assert.match(html, /\.frame\.assistant-turn\s*\{[^}]*border-left:[^}]*\}/);
    assert.match(html, /\.frame\.session-start\s*\{[^}]*border-radius:[^}]*\}/);
  });

  it('user_turn renderer reuses the .frame.user bubble styling', () => {
    const html = readHtml();
    // The class string must include both `.user` and `.user-turn`.
    assert.match(html, /div\.className\s*=\s*['"]frame user user-turn['"]/);
  });

  it('truncated frames render a (truncated) tag', () => {
    const html = readHtml();
    assert.match(html, /_appendTruncatedTag/);
    assert.match(html, /tag\.textContent\s*=\s*['"]\(truncated\)['"]/);
  });

  it('functional — frameTs() parses a real ISO ts and returns a valid Date', () => {
    // Eval-extract the helper so we can exercise its behavior, not just
    // assert that the source contains certain strings (Red Team test-
    // quality concern — give one functional assertion teeth).
    const html = readHtml();
    const startIdx = html.indexOf('function frameTs(frame, fallback)');
    assert.ok(startIdx > 0, 'frameTs source locatable');
    const after = html.slice(startIdx);
    let depth = 0, endIdx = 0, started = false;
    for (let i = 0; i < after.length; i++) {
      const ch = after[i];
      if (ch === '{') { depth++; started = true; }
      else if (ch === '}') { depth--; if (started && depth === 0) { endIdx = i + 1; break; } }
    }
    const src = after.slice(0, endIdx);
    const fn = new Function(src + '\nreturn frameTs;')();

    const fallback = new Date(2026, 0, 1);
    // Valid ISO ts → returns parsed Date (NOT the fallback)
    const r1 = fn({ ts: '2026-05-06T17:38:00.218Z' }, fallback);
    assert.ok(r1 instanceof Date && !isNaN(r1.getTime()), 'returns a valid Date');
    assert.notEqual(r1.getTime(), fallback.getTime(), 'parsed ts must differ from fallback');
    assert.equal(r1.toISOString(), '2026-05-06T17:38:00.218Z');
    // Missing ts → returns fallback
    const r2 = fn({ type: 'session_start' }, fallback);
    assert.equal(r2.getTime(), fallback.getTime(), 'no ts → fallback');
    // Garbage ts → returns fallback (NaN guard)
    const r3 = fn({ ts: 'not a date' }, fallback);
    assert.equal(r3.getTime(), fallback.getTime(), 'invalid ts → fallback');
    // Two frames with distinct ts → distinct Dates (the actual bug being prevented)
    const a = fn({ ts: '2026-05-06T10:00:00Z' }, fallback);
    const b = fn({ ts: '2026-05-06T10:00:05Z' }, fallback);
    assert.notEqual(a.getTime(), b.getTime(), 'distinct frame.ts → distinct timestamps (no batch collapse)');
  });
});

// ── Bug 4 — top vs bottom pane separation ────────────────────────────────────

describe('M48 Bug 4 (M52-narrowed) — only the LIVE main session is blocked from the bottom pane', () => {
  it('renderRailEntry click handler blocks ONLY the live main session id (in-session-* === window.__mainSessionId)', () => {
    const html = readHtml();
    // The renderRailEntry click handler must NOT bail on every in-session-*
    // entry (the pre-M52 bug — historical conversations were unclickable).
    // It must check the entry against the LIVE main session id specifically.
    const clickBlock = html.match(/el\.addEventListener\(['"]click['"][\s\S]*?container\.appendChild\(el\)/);
    assert.ok(clickBlock, 'rail-entry click handler present');
    assert.match(
      clickBlock[0],
      /isInSession\s*&&\s*node\.spawnId\s*===\s*\(\s*['"]in-session-['"]\s*\+\s*window\.__mainSessionId\s*\)/,
      'click handler must compare entry id to in-session-{__mainSessionId}, not bail on all in-session-* entries',
    );
  });

  it('initial bottom-pane resolution allows historical in-session-* selections to seed', () => {
    const html = readHtml();
    // M52: the seeded id is no longer scrubbed for being in-session-*. The
    // live-main collision is handled later by fetchMainSession's callback.
    // Assert the OLD scrub block is gone.
    assert.doesNotMatch(
      html,
      /initialBottomId\.indexOf\(['"]in-session-['"]\)\s*===\s*0[\s\S]*?initialBottomId\s*=\s*['"]['"]/,
      'pre-M52 unconditional scrub of in-session-* seed must be removed',
    );
  });

  it('fetchMainSession callback clears the bottom-pane seed when it collides with the live main session id', () => {
    const html = readHtml();
    const fmBlock = html.match(/function fetchMainSession\(\)[\s\S]*?\n\s+\}/);
    assert.ok(fmBlock, 'fetchMainSession defined');
    // The callback must compare the seeded SS_KEY_SELECTED to in-session-{sessionId}
    // and clear it when they match (so the bottom pane never mirrors top).
    assert.match(fmBlock[0], /['"]in-session-['"]\s*\+\s*j\.sessionId/);
    assert.match(fmBlock[0], /SS_KEY_SELECTED/);
  });

  it('hashchange handler blocks ONLY the live main session id, not all in-session-* hashes', () => {
    const html = readHtml();
    const hashBlock = html.match(/window\.addEventListener\(['"]hashchange['"][\s\S]*?\}\)/);
    assert.ok(hashBlock, 'hashchange handler present');
    // The pre-M52 unconditional `id.indexOf('in-session-') === 0` block is gone.
    assert.doesNotMatch(
      hashBlock[0],
      /id\.indexOf\(['"]in-session-['"]\)\s*===\s*0/,
      'pre-M52 unconditional in-session-* prefix bail must be removed',
    );
    // Replaced with an exact-match check against in-session-{__mainSessionId}.
    assert.match(
      hashBlock[0],
      /id\s*===\s*\(\s*['"]in-session-['"]\s*\+\s*window\.__mainSessionId\s*\)/,
    );
    assert.match(hashBlock[0], /return/);
  });

  it('maybeAutoFollow filters in-session-* spawns out of the auto-follow candidate set', () => {
    const html = readHtml();
    const autoBlock = html.match(/function maybeAutoFollow\([\s\S]*?\n\s+\}/);
    assert.ok(autoBlock, 'maybeAutoFollow defined');
    assert.match(autoBlock[0], /\.filter\([\s\S]*?indexOf\(['"]in-session-['"]\)\s*===\s*0/);
  });

  it('regression — legacy renderTree click handler also gates only on the live main session (M52)', () => {
    const html = readHtml();
    const start = html.indexOf('function renderTree(');
    assert.ok(start > 0, 'renderTree function present');
    const after = html.slice(start);
    const block = after.slice(0, after.indexOf('// ── Auto-follow latest spawn'));
    assert.ok(block.length > 100, 'renderTree body extracted');
    // Click handler must consult isInSession(node) AND compare to the live
    // main session id — the M52 narrowed pattern (not the pre-M52 unconditional bail).
    const guardIdx = block.search(/if\s*\(\s*isInSession\(node\)\s*&&\s*node\.spawnId\s*===\s*\(\s*['"]in-session-['"]\s*\+\s*window\.__mainSessionId\s*\)\s*\)\s*return/);
    const hashIdx = block.indexOf('location.hash = node.spawnId');
    assert.ok(guardIdx > 0, 'renderTree click handler must use the M52 narrowed isInSession + main-session check');
    assert.ok(hashIdx > guardIdx, 'narrowed isInSession guard must precede the location.hash mutation');
    // Pre-M52 unconditional `if (isInSession(node)) return;` (no main-session check) is gone.
    assert.doesNotMatch(block, /if\s*\(\s*isInSession\(node\)\s*\)\s*return/);
  });
});
