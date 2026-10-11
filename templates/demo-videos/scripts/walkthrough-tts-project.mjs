/**
 * Which Google Cloud project pays for the narration.
 *
 * Cloud Text-to-Speech with a personal login needs a quota project — the
 * project the characters are billed to — sent as `x-goog-user-project`. Each
 * person uses their OWN project; nothing here may default to someone else's.
 *
 * Source, in order of how explicitly it was set:
 *   1. GOOGLE_TTS_PROJECT in the environment (or the project's .env)
 *   2. the quota project stored with the login, set by
 *      `gcloud auth application-default set-quota-project <id>`
 * Neither set → HALT with the exact commands. Never a guess.
 */
import { existsSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function adcFile() {
  const dir = process.env.CLOUDSDK_CONFIG
    ?? (process.platform === 'win32'
      ? path.join(process.env.APPDATA ?? '', 'gcloud')
      : path.join(os.homedir(), '.config', 'gcloud'));
  return path.join(dir, 'application_default_credentials.json');
}

export function resolveTtsProject() {
  const fromEnv = (process.env.GOOGLE_TTS_PROJECT ?? '').trim();
  if (fromEnv) return { project: fromEnv, source: 'GOOGLE_TTS_PROJECT' };
  const file = adcFile();
  if (existsSync(file)) {
    const quota = String(JSON.parse(readFileSync(file, 'utf8')).quota_project_id ?? '').trim();
    if (quota) return { project: quota, source: 'gcloud login quota project' };
  }
  return { project: null, source: null };
}

export const PROJECT_FIX =
  'No Google Cloud project is set to pay for the narration. Use your own project:\n' +
  '  gcloud auth application-default set-quota-project <your-project-id>\n' +
  '  (or set GOOGLE_TTS_PROJECT=<your-project-id> in the environment / .env)\n' +
  'No project yet? Create one at https://console.cloud.google.com/projectcreate and attach billing.';
