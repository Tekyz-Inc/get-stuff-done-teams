/**
 * Load a walkthrough's narration manifest.
 *
 * Playwright imports EVERY spec in the project before it applies --grep, so a
 * spec whose audio has not been rendered yet used to throw at import time and
 * take the whole run down with it — including the walkthroughs that were ready.
 * Missing audio is a reason to skip that one walkthrough, not to fail the run.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export interface Narration {
  ready: boolean;
  audio: Map<string, { file: string; ms: number }>;
  L: string[];
}

export function loadNarration(name: string): Narration {
  const file = path.join(process.cwd(), '.demo-build', `audio-${name}.json`);
  if (!existsSync(file)) return { ready: false, audio: new Map(), L: [] };

  const manifest = JSON.parse(readFileSync(file, 'utf8'));
  return {
    ready: true,
    audio: new Map(
      manifest.lines.map((l: any) => [l.text, { file: l.file, ms: l.ms }]),
    ),
    L: manifest.lines.map((l: any) => l.text as string),
  };
}
