/**
 * Is this machine ready to make demo videos? Run before anything else.
 *
 *   node scripts/walkthrough-setup-check.mjs
 *
 * Checks, in order, and prints the exact fix for each one that fails:
 *   ffmpeg · auto-editor (project venv) · gcloud CLI · gcloud login
 *   · a quota project of your own · the Text-to-Speech API answering a test sentence
 * Exit 0 when everything passes, 4 otherwise. A network failure on the test
 * call stops the check with the error. Changes nothing.
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { resolveTtsProject, PROJECT_FIX } from './walkthrough-tts-project.mjs';

const VOICE = process.env.TTS_VOICE ?? 'en-US-Chirp3-HD-Algieba';
const results = [];
const check = (name, ok, fix) => { results.push({ name, ok, fix }); return ok; };

// "Is it installed / logged in?" — a non-zero exit IS the answer being asked for.
function succeeds(cmd, args) {
  try { execFileSync(cmd, args, { stdio: 'ignore' }); return true; } catch { return false; }
}

check('ffmpeg', succeeds('ffmpeg', ['-version']),
  'Install ffmpeg: brew install ffmpeg   (Linux: apt install ffmpeg)');

const ae = path.join(process.cwd(), '.venv-tools', 'auto-editor', 'bin', 'auto-editor');
check('auto-editor (project venv)', existsSync(ae),
  'python3 -m venv .venv-tools/auto-editor && .venv-tools/auto-editor/bin/pip install auto-editor');

const hasGcloud = check('gcloud CLI', succeeds('gcloud', ['--version']),
  'Install the Google Cloud CLI: brew install --cask google-cloud-sdk   (or https://cloud.google.com/sdk/docs/install)');

const loggedIn = hasGcloud && check('gcloud login (Application Default Credentials)',
  succeeds('gcloud', ['auth', 'application-default', 'print-access-token']),
  'Run: gcloud auth application-default login   (a browser opens; sign in with your Google account)');

const { project, source } = resolveTtsProject();
check(`quota project${project ? ` (${project}, from ${source})` : ''}`, !!project, PROJECT_FIX);

if (loggedIn && project) {
  const token = execFileSync('gcloud', ['auth', 'application-default', 'print-access-token'],
    { encoding: 'utf8' }).trim();
  const res = await fetch('https://texttospeech.googleapis.com/v1/text:synthesize', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'x-goog-user-project': project, 'Content-Type': 'application/json' },
    body: JSON.stringify({ input: { text: 'Voice check.' }, voice: { languageCode: 'en-US', name: VOICE },
      audioConfig: { audioEncoding: 'LINEAR16' } }),
    signal: AbortSignal.timeout(30_000),
  });
  const detail = res.ok ? '' : await res.text();
  let fix = `Text-to-Speech call failed (${res.status}): ${detail.slice(0, 200)}`;
  if (/SERVICE_DISABLED|has not been used|is disabled/i.test(detail)) {
    fix = `Enable the API: gcloud services enable texttospeech.googleapis.com --project ${project}`;
  } else if (/billing/i.test(detail)) {
    fix = `Attach billing to ${project}: https://console.cloud.google.com/billing/linkedaccount?project=${project}`;
  } else if (/PERMISSION_DENIED|serviceusage/i.test(detail)) {
    fix = `Your login cannot use ${project}. ${PROJECT_FIX}`;
  }
  check(`Text-to-Speech API (voice ${VOICE})`, res.ok, fix);
}

let failed = 0;
for (const r of results) {
  console.log(`${r.ok ? '  ✓' : '  ✗'} ${r.name}`);
  if (!r.ok) { failed += 1; console.log(`      ${r.fix.split('\n').join('\n      ')}`); }
}
if (failed) {
  console.log(`\n✗ ${failed} setup step(s) to finish — fix them in order, then run this again.`);
  process.exit(4);
}
console.log('\n✓ Ready to make demo videos.');
