// Per-clip speaking rate (same measure as walkthrough-voice-check.mjs), to find the sentence that trips
// the rate gate:  node scripts/walkthrough-clip-rates.mjs <name> | sort -k2 -n
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
const man = JSON.parse(readFileSync(`.demo-build/audio-${process.argv[2]}.json`, 'utf8'));
for (const [i, line] of man.lines.entries()) {
  const buf = execFileSync('ffmpeg', ['-v','error','-i',line.file,'-ac','1','-ar','16000','-f','s16le','-'], { maxBuffer: 1 << 28 });
  const n = buf.length / 2, d = new Float32Array(n); for (let k = 0; k < n; k++) d[k] = buf.readInt16LE(k * 2) / 32768;
  const win = 320, env = []; for (let s = 0; s + win < n; s += win) { let e = 0; for (let k = 0; k < win; k++) e += d[s + k] ** 2; env.push(Math.sqrt(e / win)); }
  const peak = Math.max(...env), floor = peak * 0.15; let c = 0;
  for (let k = 1; k < env.length - 1; k++) if (env[k] > floor && env[k] >= env[k - 1] && env[k] > env[k + 1]) c++;
  console.log(String(i).padStart(2), (c / (n / 16000)).toFixed(1), line.text.slice(0, 70));
}
