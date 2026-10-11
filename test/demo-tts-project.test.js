'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const SCRIPTS = path.join(__dirname, '..', 'templates', 'demo-videos', 'scripts');
const load = () => import(path.join(SCRIPTS, 'walkthrough-tts-project.mjs') + `?t=${Date.now()}${Math.random()}`);

function withEnv(env, fn) {
  const saved = {};
  for (const k of Object.keys(env)) { saved[k] = process.env[k]; if (env[k] === undefined) delete process.env[k]; else process.env[k] = env[k]; }
  return fn().finally(() => { for (const k of Object.keys(saved)) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });
}

test('quota project: env first, then the login quota project, else none — never a built-in id', async () => {
  const cfg = fs.mkdtempSync(path.join(os.tmpdir(), 'gsdt-gcloud-'));
  try {
    await withEnv({ GOOGLE_TTS_PROJECT: undefined, CLOUDSDK_CONFIG: cfg }, async () => {
      const m = await load();
      assert.deepStrictEqual(m.resolveTtsProject(), { project: null, source: null });
      fs.writeFileSync(path.join(cfg, 'application_default_credentials.json'), JSON.stringify({ quota_project_id: 'mine-123' }));
      assert.strictEqual(m.resolveTtsProject().project, 'mine-123');
    });
    await withEnv({ GOOGLE_TTS_PROJECT: 'env-456', CLOUDSDK_CONFIG: cfg }, async () => {
      assert.strictEqual((await load()).resolveTtsProject().project, 'env-456');
    });
  } finally { fs.rmSync(cfg, { recursive: true, force: true }); }
});

test('no template script carries a hardcoded Google Cloud project id', () => {
  for (const f of fs.readdirSync(SCRIPTS)) {
    assert.doesNotMatch(fs.readFileSync(path.join(SCRIPTS, f), 'utf8'), /gen-lang-client-\d+/, f);
  }
});
