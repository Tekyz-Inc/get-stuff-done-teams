'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const CLI = path.join(__dirname, '..', 'bin', 'gsd-t.js');
const PINS = require('../bin/gsd-t.js').MODEL_PINS;

function home(settings, pins) {
  const h = fs.mkdtempSync(path.join(os.tmpdir(), 'gsdt-pins-'));
  fs.mkdirSync(path.join(h, '.claude'));
  if (settings) fs.writeFileSync(path.join(h, '.claude', 'settings.json'), JSON.stringify(settings));
  if (pins) fs.writeFileSync(path.join(h, '.claude', '.gsd-t-model-pins.json'), JSON.stringify(pins));
  return h;
}
function install(h) {
  const env = { ...process.env, HOME: h };
  for (const k of ['CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX', 'CLAUDE_CODE_USE_FOUNDRY', 'ANTHROPIC_BASE_URL']) delete env[k];
  return execFileSync('node', [CLI, 'install'], { env, encoding: 'utf8', stdio: 'pipe' });
}
const envOf = (h) => JSON.parse(fs.readFileSync(path.join(h, '.claude', 'settings.json'), 'utf8')).env || {};

test('pins point at the newest Sonnet and Haiku', () => {
  assert.deepStrictEqual(PINS, { ANTHROPIC_DEFAULT_SONNET_MODEL: 'claude-sonnet-5-5', ANTHROPIC_DEFAULT_HAIKU_MODEL: 'claude-haiku-5-5' });
});

test('fresh install sets both aliases and keeps other env keys', () => {
  const h = home({ env: { MY_FLAG: '1' } });
  try {
    install(h);
    const env = envOf(h);
    assert.strictEqual(env.ANTHROPIC_DEFAULT_SONNET_MODEL, 'claude-sonnet-5-5');
    assert.strictEqual(env.ANTHROPIC_DEFAULT_HAIKU_MODEL, 'claude-haiku-5-5');
    assert.strictEqual(env.MY_FLAG, '1');
  } finally { fs.rmSync(h, { recursive: true, force: true }); }
});

test("a user's own alias value is never overwritten; one GSD-T set earlier is upgraded", () => {
  const h = home(
    { env: { ANTHROPIC_DEFAULT_SONNET_MODEL: 'my-proxy-sonnet', ANTHROPIC_DEFAULT_HAIKU_MODEL: 'claude-haiku-4-5' } },
    { ANTHROPIC_DEFAULT_HAIKU_MODEL: 'claude-haiku-4-5' },
  );
  try {
    install(h);
    const env = envOf(h);
    assert.strictEqual(env.ANTHROPIC_DEFAULT_SONNET_MODEL, 'my-proxy-sonnet', 'user value kept');
    assert.strictEqual(env.ANTHROPIC_DEFAULT_HAIKU_MODEL, 'claude-haiku-5-5', 'GSD-T value upgraded');
  } finally { fs.rmSync(h, { recursive: true, force: true }); }
});

test('Bedrock / Vertex / custom endpoint: aliases left alone', () => {
  const h = home({ env: { CLAUDE_CODE_USE_BEDROCK: '1' } });
  try {
    const out = install(h);
    assert.match(out, /Model aliases left alone — CLAUDE_CODE_USE_BEDROCK/);
    assert.strictEqual(envOf(h).ANTHROPIC_DEFAULT_HAIKU_MODEL, undefined);
  } finally { fs.rmSync(h, { recursive: true, force: true }); }
});
