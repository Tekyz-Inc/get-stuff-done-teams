/**
 * M55 D3 — Rate-Limit Probe unit tests.
 *
 * Pure-logic coverage; NO live API hits. Validates:
 *   - sweep matrix construction (84 cells)
 *   - per-cell summary envelope (p50/p95/429/declaredSafe)
 *   - declared-safe rule edge cases
 *   - fixture-size validator (±5% via 1-token≈4-char heuristic)
 *   - account-mask helper (api-key vs OAuth path, prefix length)
 *   - recommended-derivation rules
 *   - probe-worker rate-limit/retry-after detection
 *
 * Contract: .gsd-t/contracts/ratelimit-map-contract.md v1.0.0
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const probe = require('../bin/gsd-t-ratelimit-probe.cjs');
const worker = require('../bin/gsd-t-ratelimit-probe-worker.cjs');

const FIXTURES_DIR = path.join(__dirname, '..', '.gsd-t', 'fixtures', 'ratelimit-probe');
const FIXTURE_TARGETS = [10000, 30000, 60000, 100000];

// ── Matrix construction ─────────────────────────────────────────────────────

describe('buildSweepMatrix', () => {
  it('returns 84 sweep cells for charter matrix (7 × 4 × 3 runs)', () => {
    const cells = probe.buildSweepMatrix({
      workers: probe.SWEEP_WORKERS,
      contexts: probe.SWEEP_CONTEXTS,
      runsPerCell: probe.RUNS_PER_CELL,
    });
    assert.equal(cells.length, 28, 'cell count = 7 × 4 = 28');
    const totalRuns = cells.reduce((a, c) => a + c.runsPerCell, 0);
    assert.equal(totalRuns, 84, 'total runs = 28 × 3 = 84');
  });

  it('respects runsPerCell parameter', () => {
    const cells = probe.buildSweepMatrix({ workers: [1, 2], contexts: [10000, 30000], runsPerCell: 5 });
    assert.equal(cells.length, 4);
    assert.equal(cells[0].runsPerCell, 5);
  });

  it('charter constants match spec', () => {
    assert.deepStrictEqual(probe.SWEEP_WORKERS, [1, 2, 3, 4, 5, 6, 8]);
    assert.deepStrictEqual(probe.SWEEP_CONTEXTS, [10000, 30000, 60000, 100000]);
    assert.equal(probe.RUNS_PER_CELL, 3);
  });
});

// ── Summary envelope ────────────────────────────────────────────────────────

describe('summarizeCell', () => {
  it('computes p50/p95/total429/declaredSafe correctly on a clean cell', () => {
    const runs = [
      { ttftMs: 1000, totalMs: 2000, status429: false },
      { ttftMs: 2000, totalMs: 3000, status429: false },
      { ttftMs: 3000, totalMs: 4000, status429: false },
    ];
    const s = probe.summarizeCell(runs);
    assert.equal(s.total429, 0);
    assert.equal(s.p50TtftMs, 2000);
    assert.equal(s.p95TtftMs, 2900); // p95 of [1000,2000,3000] = 2000 + 0.9*1000 = 2900
    assert.equal(s.declaredSafe, true);
  });

  it('declaredSafe=false when ANY 429 occurs', () => {
    const runs = [
      { ttftMs: 1000, status429: false },
      { ttftMs: 2000, status429: true },
      { ttftMs: 3000, status429: false },
    ];
    const s = probe.summarizeCell(runs);
    assert.equal(s.total429, 1);
    assert.equal(s.declaredSafe, false);
  });

  it('declaredSafe=false when p95 > 8000ms even with zero 429', () => {
    const runs = [
      { ttftMs: 7000, status429: false },
      { ttftMs: 8000, status429: false },
      { ttftMs: 9000, status429: false }, // p95 = 8800
    ];
    const s = probe.summarizeCell(runs);
    assert.equal(s.total429, 0);
    assert.equal(s.p95TtftMs > 8000, true);
    assert.equal(s.declaredSafe, false);
  });

  it('declaredSafe=true at p95 exactly 8000ms with zero 429', () => {
    const runs = [
      { ttftMs: 8000, status429: false },
      { ttftMs: 8000, status429: false },
      { ttftMs: 8000, status429: false },
    ];
    const s = probe.summarizeCell(runs);
    assert.equal(s.p95TtftMs, 8000);
    assert.equal(s.declaredSafe, true);
  });

  it('declaredSafe=false when no successful runs (all ttft null)', () => {
    const runs = [
      { ttftMs: null, status429: false },
      { ttftMs: null, status429: false },
    ];
    const s = probe.summarizeCell(runs);
    assert.equal(s.p95TtftMs, null);
    assert.equal(s.declaredSafe, false);
  });
});

// ── Fixture size validator ──────────────────────────────────────────────────

describe('fixture-size validator', () => {
  it('all 4 fixtures exist on disk', () => {
    for (const t of FIXTURE_TARGETS) {
      const fp = path.join(FIXTURES_DIR, 'context-' + (t / 1000) + 'k.txt');
      assert.equal(fs.existsSync(fp), true, 'fixture missing: ' + fp);
    }
  });

  it('each fixture char-count is within ±5% of target × 4 (heuristic 1 token ≈ 4 chars)', () => {
    for (const t of FIXTURE_TARGETS) {
      const fp = path.join(FIXTURES_DIR, 'context-' + (t / 1000) + 'k.txt');
      const body = fs.readFileSync(fp, 'utf8');
      const heuristicTokens = Math.round(body.length / 4);
      const lo = t * 0.95;
      const hi = t * 1.05;
      assert.ok(heuristicTokens >= lo && heuristicTokens <= hi,
        'fixture ' + t + ' token-count ' + heuristicTokens + ' outside ±5% of ' + t);
    }
  });

  it('each fixture contains the synthetic CLAUDE.md header', () => {
    for (const t of FIXTURE_TARGETS) {
      const fp = path.join(FIXTURES_DIR, 'context-' + (t / 1000) + 'k.txt');
      const body = fs.readFileSync(fp, 'utf8');
      assert.ok(body.includes('CLAUDE.md (synthetic'), 'fixture ' + t + ' missing CLAUDE.md prelude');
      assert.ok(body.includes('Synthetic Contract'), 'fixture ' + t + ' missing contract section');
    }
  });
});

// ── Account masking ─────────────────────────────────────────────────────────

describe('maskAccount', () => {
  it('hashes apiKey to 16-hex prefix when api-key path', () => {
    const r = probe.maskAccount({ apiKey: 'sk-ant-fake-key-123', oauthToken: null });
    assert.equal(r.authPath, 'api-key');
    assert.equal(r.account.length, 16);
    assert.match(r.account, /^[0-9a-f]{16}$/);
  });

  it('hashes oauthToken with "oauth-" prefix when oauth-claude-max path', () => {
    const r = probe.maskAccount({ apiKey: null, oauthToken: 'sk-ant-oat01-fake-token-456' });
    assert.equal(r.authPath, 'oauth-claude-max');
    assert.equal(r.account.startsWith('oauth-'), true);
    assert.equal(r.account.length, 'oauth-'.length + 16);
    assert.match(r.account, /^oauth-[0-9a-f]{16}$/);
  });

  it('apiKey takes precedence over oauthToken when both present', () => {
    const r = probe.maskAccount({ apiKey: 'kkk', oauthToken: 'ooo' });
    assert.equal(r.authPath, 'api-key');
    assert.equal(r.account.startsWith('oauth-'), false);
  });

  it('returns unknown when neither credential present', () => {
    const r = probe.maskAccount({ apiKey: null, oauthToken: null });
    assert.equal(r.authPath, 'unknown');
    assert.equal(r.account, 'unknown');
  });

  it('NEVER writes raw key (output never contains the input)', () => {
    const secret = 'sk-ant-secret-abcdef-1234567890';
    const r = probe.maskAccount({ apiKey: secret, oauthToken: null });
    assert.equal(r.account.includes(secret), false);
    assert.equal(r.account.includes('abcdef'), false);
  });
});

// ── Recommended derivation ──────────────────────────────────────────────────

describe('deriveRecommended', () => {
  function cell(workers, ctx, declaredSafe) {
    return { workers, contextTokens: ctx, summary: { declaredSafe, p50TtftMs: 1, p95TtftMs: 2, total429: declaredSafe ? 0 : 1 } };
  }

  it('peakConcurrency = highest workers value with any safe cell', () => {
    const matrix = [
      cell(1, 10000, true), cell(2, 10000, true), cell(3, 10000, true),
      cell(4, 10000, true), cell(6, 10000, false), cell(8, 10000, false),
    ];
    const r = probe.deriveRecommended({ matrix, backoffProbe: null, steadyState: null });
    assert.equal(r.peakConcurrency, 4);
  });

  it('safeConcurrencyAt60kContext = highest safe workers at exactly 60k', () => {
    const matrix = [
      cell(2, 60000, true), cell(3, 60000, true), cell(4, 60000, false),
      cell(6, 100000, true), // peak might be 6 elsewhere but 60k caps at 3
    ];
    const r = probe.deriveRecommended({ matrix, backoffProbe: null, steadyState: null });
    assert.equal(r.safeConcurrencyAt60kContext, 3);
    assert.equal(r.peakConcurrency, 6);
  });

  it('floors to 1 when no cells declared safe', () => {
    const matrix = [cell(1, 10000, false), cell(2, 10000, false)];
    const r = probe.deriveRecommended({ matrix, backoffProbe: null, steadyState: null });
    assert.equal(r.peakConcurrency, 1);
    assert.equal(r.safeConcurrencyAt60kContext, 1);
    assert.equal(r.perWorkerContextBudgetTokens, 10000);
  });

  it('backoffMs = 0 when trigger never produced a 429', () => {
    const r = probe.deriveRecommended({
      matrix: [],
      backoffProbe: { trigger429Count: 0, post429RecoverySamples: [] },
      steadyState: null,
    });
    assert.equal(r.backoffMs, 0);
  });

  it('backoffMs = first ok recovery sample tElapsedMs', () => {
    const r = probe.deriveRecommended({
      matrix: [],
      backoffProbe: {
        trigger429Count: 24,
        post429RecoverySamples: [
          { tElapsedMs: 5000, ok: false, status429: true },
          { tElapsedMs: 10000, ok: false, status429: true },
          { tElapsedMs: 15000, ok: true, status429: false, ttftMs: 2000 },
        ],
      },
      steadyState: null,
    });
    assert.equal(r.backoffMs, 15000);
  });

  it('backoffMs falls back to 30000 when no recovery sample succeeded', () => {
    const r = probe.deriveRecommended({
      matrix: [],
      backoffProbe: {
        trigger429Count: 24,
        post429RecoverySamples: [
          { tElapsedMs: 5000, ok: false, status429: true },
          { tElapsedMs: 10000, ok: false, status429: true },
        ],
      },
      steadyState: null,
    });
    assert.equal(r.backoffMs, 30000);
  });

  it('steadyState3Workers5MinPass mirrors steadyState.ok', () => {
    const r1 = probe.deriveRecommended({ matrix: [], backoffProbe: null, steadyState: { ok: true } });
    assert.equal(r1.steadyState3Workers5MinPass, true);
    const r2 = probe.deriveRecommended({ matrix: [], backoffProbe: null, steadyState: { ok: false } });
    assert.equal(r2.steadyState3Workers5MinPass, false);
    const r3 = probe.deriveRecommended({ matrix: [], backoffProbe: null, steadyState: null });
    assert.equal(r3.steadyState3Workers5MinPass, false);
  });
});

// ── Probe-worker rate-limit detection ───────────────────────────────────────

describe('probe-worker', () => {
  it('detects rate-limit phrasing in stderr', () => {
    assert.equal(worker.RATE_LIMIT_RE.test('error: rate_limit_exceeded'), true);
    assert.equal(worker.RATE_LIMIT_RE.test('HTTP 429: too many requests'), true);
    assert.equal(worker.RATE_LIMIT_RE.test('Rate Limit hit, retry'), true);
    assert.equal(worker.RATE_LIMIT_RE.test('hello world'), false);
  });

  it('detectRetryAfterMs parses retry-after-ms in stderr', () => {
    assert.equal(worker.detectRetryAfterMs('rate_limit retry-after-ms: 12500'), 12500);
  });

  it('detectRetryAfterMs parses retry-after seconds (×1000)', () => {
    assert.equal(worker.detectRetryAfterMs('rate_limit retry-after: 30'), 30000);
  });

  it('detectRetryAfterMs returns null when absent', () => {
    assert.equal(worker.detectRetryAfterMs('something else entirely'), null);
  });
});

// ── Output schema shape ─────────────────────────────────────────────────────

describe('output schema shape', () => {
  it('SCHEMA_VERSION is "1.0.0"', () => {
    assert.equal(probe.SCHEMA_VERSION, '1.0.0');
  });

  it('DECLARED_SAFE_P95_TTFT_MS is 8000 (charter)', () => {
    assert.equal(probe.DECLARED_SAFE_P95_TTFT_MS, 8000);
  });

  it('percentile helper is monotone', () => {
    const data = [1, 2, 3, 4, 5];
    const p50 = probe.percentile(data, 50);
    const p95 = probe.percentile(data, 95);
    assert.equal(p50, 3);
    assert.ok(p95 > p50);
  });

  it('percentile of single-element returns that element', () => {
    assert.equal(probe.percentile([42], 50), 42);
    assert.equal(probe.percentile([42], 95), 42);
  });

  it('percentile of empty returns null', () => {
    assert.equal(probe.percentile([], 50), null);
  });
});

// ── Backoff/steady-state schema (no live probe) ─────────────────────────────

describe('backoff/steady-state schema in derived output', () => {
  it('a synthesized full-output object with backoff+steady has all required keys', () => {
    const synth = {
      schemaVersion: probe.SCHEMA_VERSION,
      generatedAt: new Date().toISOString(),
      claudeCliVersion: '2.1.138',
      account: 'oauth-deadbeefcafef00d',
      accountTier: 'default_claude_max_20x',
      authPath: 'oauth-claude-max',
      matrix: [],
      backoffProbe: {
        triggerCell: { workers: 8, contextTokens: 100000, runs: 3 },
        trigger429Count: 0,
        post429RecoverySamples: [],
      },
      steadyState: {
        workers: 3, contextTokens: 30000, durationSec: 300,
        sampleCadenceSec: 30, samples: [], sustainedItpm: 0, sustainedOtpm: 0, ok: true,
      },
      recommended: probe.deriveRecommended({
        matrix: [], backoffProbe: { trigger429Count: 0, post429RecoverySamples: [] }, steadyState: { ok: true },
      }),
      notes: [],
    };
    assert.ok(synth.backoffProbe.triggerCell);
    assert.ok(Array.isArray(synth.backoffProbe.post429RecoverySamples));
    assert.equal(synth.steadyState.workers, 3);
    assert.equal(synth.steadyState.contextTokens, 30000);
    assert.equal(typeof synth.recommended.peakConcurrency, 'number');
    assert.equal(typeof synth.recommended.backoffMs, 'number');
    assert.equal(typeof synth.recommended.steadyState3Workers5MinPass, 'boolean');
  });
});
