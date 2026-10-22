#!/usr/bin/env node
'use strict';

/**
 * gsd-t-talk-start.js — SessionStart hook for GSD-T talk.
 *
 * Starts the shared talk program (bin/gsd-t-talk.cjs) in the background when it
 * is not already running. It stays idle until you hold Ctrl+Option+Space in the
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

function main() {
  const talkScript = process.argv[2];
  const home = os.homedir();
  const handoff = path.join(home, '.claude', '.gsd-t-talk.json');
  if (fs.existsSync(handoff) && pidAlive(JSON.parse(fs.readFileSync(handoff, 'utf8')).pid)) return;
  if (!fs.existsSync(talkScript)) {
    process.stderr.write('GSD-T talk: ' + talkScript + ' is missing — run `gsd-t install`\n');
    process.exit(1);
  }
  const dir = path.join(home, '.claude', 'gsd-t-talk');
  fs.mkdirSync(dir, { recursive: true });
  const log = fs.openSync(path.join(dir, 'talk.log'), 'a');
  const child = spawn(process.execPath, [talkScript], { detached: true, stdio: ['ignore', log, log] });
  child.unref();
}

main();
