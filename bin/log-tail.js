#!/usr/bin/env node
// Log Tail — print the last N lines of a log file. Used by GSD-T command files to
// truncate test/build output before forwarding it into the conversation context.
//
// Usage:
//   node bin/log-tail.js <logfile>              # print last 100 lines
//   node bin/log-tail.js <logfile> 500          # print last 500 lines
//   node bin/log-tail.js <logfile> --on-fail    # print 500 lines if the log contains
//                                                  "FAIL", "ERROR", or non-zero exit;
//                                                  100 lines otherwise
//
// Why: piping `npm test` or `playwright test` directly into a Bash tool result
// dumps the entire stdout (often 5K-50K tokens) into context. This helper writes
// the full log to disk and prints only the tail, with a header showing the path
// to the full log so the agent can read more if needed.

const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const opts = { logFile: null, lines: 100, onFail: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--on-fail') opts.onFail = true;
    else if (a === '--help' || a === '-h') {
      console.log('Usage: node bin/log-tail.js <logfile> [N=100] [--on-fail]');
      process.exit(0);
    } else if (!opts.logFile) {
      opts.logFile = a;
    } else if (/^\d+$/.test(a)) {
      opts.lines = parseInt(a, 10);
    }
  }
  return opts;
}

function detectFailure(content) {
  return /\b(FAIL|FAILED|ERROR|Exception|Traceback|Test Failed|✗|❌)\b/i.test(content);
}

function tail(content, n) {
  const lines = content.split('\n');
  if (lines.length <= n) return lines;
  return lines.slice(-n);
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.logFile) {
    console.error('Usage: node bin/log-tail.js <logfile> [N=100] [--on-fail]');
    process.exit(2);
  }

  const abs = path.resolve(opts.logFile);
  if (!fs.existsSync(abs)) {
    console.error(`log-tail: file not found — ${abs}`);
    process.exit(2);
  }

  const content = fs.readFileSync(abs, 'utf8');
  let n = opts.lines;
  if (opts.onFail) {
    n = detectFailure(content) ? 500 : 100;
  }

  const total = content.split('\n').length;
  const tailLines = tail(content, n);
  const truncated = total > n;

  console.log(`─── log tail: ${abs} ───`);
  console.log(`    total lines: ${total}    showing: ${tailLines.length}    truncated: ${truncated}`);
  if (truncated) {
    console.log(`    full log: cat ${abs}`);
  }
  console.log('─────────────────────────────────────────────────────────────');
  console.log(tailLines.join('\n'));
}

if (require.main === module) main();

module.exports = { tail, detectFailure };
