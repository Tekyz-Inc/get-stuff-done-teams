#!/usr/bin/env node
'use strict';

/**
 * gsd-t-talk-start.js — SessionStart hook for GSD-T talk.
 *
 * Starts the shared talk program (bin/gsd-t-talk.cjs --supervise) in the
 * background when it is not already running. It stays idle until you hold Ctrl+Option+Space in the
 * dictation app. Which session you are talking to is read at that moment from
 * Claude Code's own session records, so nothing is registered here.
 *
 * argv[2] = absolute path of bin/gsd-t-talk.cjs (written by the installer).
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

function pidAlive(pid) {
  return spawnSync('ps', ['-p', String(pid)], { stdio: 'ignore' }).status === 0;
}

/** Talk is up when its supervisor or its worker is alive. */
function running(home) {
  for (const f of [path.join(home, '.claude', 'gsd-t-talk', 'supervisor.json'), path.join(home, '.claude', '.gsd-t-talk.json')]) {
    if (fs.existsSync(f) && pidAlive(JSON.parse(fs.readFileSync(f, 'utf8')).pid)) return true;
  }
  return false;
}

function main() {
  const talkScript = process.argv[2];
  const home = os.homedir();
  if (running(home)) return;
  if (!fs.existsSync(talkScript)) {
    process.stderr.write('GSD-T talk: ' + talkScript + ' is missing — run `gsd-t install`\n');
    process.exit(1);
  }
  const dir = path.join(home, '.claude', 'gsd-t-talk');
  fs.mkdirSync(dir, { recursive: true });
  const log = fs.openSync(path.join(dir, 'talk.log'), 'a');
  // Supervised: a crash is logged and restarted at most twice (see bin/gsd-t-talk.cjs).
  const child = spawn(process.execPath, [talkScript, '--supervise'], { detached: true, stdio: ['ignore', log, log] });
  child.unref();
}

main();
