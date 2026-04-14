#!/usr/bin/env node
// Archive Progress — keeps .gsd-t/progress.md lean by rolling old Decision Log
// entries into numbered archive files. Live progress.md keeps only the most recent
// entries; older entries roll into .gsd-t/progress-archive/NNN-YYYY-MM-DD.md files.
//
// Usage:
//   node bin/archive-progress.js                      # run against ./.gsd-t/progress.md
//   node bin/archive-progress.js --project /path/to   # run against a specific project
//   node bin/archive-progress.js --dry-run            # show what would happen, change nothing
//   node bin/archive-progress.js --keep 5             # override "keep last N entries" (default 5)
//   node bin/archive-progress.js --per-archive 20     # override "entries per archive" (default 20)
//
// Idempotent: safe to run anytime. Re-running with no new entries is a no-op.
//
// Decision Log format expected:
//   ## Decision Log    (or   # Decision Log   or any heading containing "Decision Log")
//   - YYYY-MM-DD[ HH:MM][ tag]: {message}    ← entry start (matched by /^- \d{4}-\d{2}-\d{2}/)
//   ... continuation lines (indented or non-leading-dash) ...
//   - YYYY-MM-DD[ HH:MM]: {next entry}

const fs = require('fs');
const path = require('path');

const DEFAULT_KEEP_LIVE = 5;
const DEFAULT_PER_ARCHIVE = 20;

const ENTRY_START = /^- (\d{4}-\d{2}-\d{2})(?:[ T]\d{2}:\d{2})?/;

function parseArgs(argv) {
  const opts = {
    projectDir: process.cwd(),
    dryRun: false,
    keepLive: DEFAULT_KEEP_LIVE,
    perArchive: DEFAULT_PER_ARCHIVE,
    quiet: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--project') opts.projectDir = path.resolve(argv[++i]);
    else if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--keep') opts.keepLive = parseInt(argv[++i], 10);
    else if (a === '--per-archive') opts.perArchive = parseInt(argv[++i], 10);
    else if (a === '--quiet' || a === '-q') opts.quiet = true;
    else if (a === '--help' || a === '-h') {
      console.log(
        'Usage: node bin/archive-progress.js [--project DIR] [--keep N] [--per-archive N] [--dry-run] [--quiet]'
      );
      process.exit(0);
    }
  }
  return opts;
}

function findDecisionLogBounds(lines) {
  // Returns { startIdx, endIdx } where startIdx is the line AFTER the heading and
  // endIdx is exclusive — the last line of the Decision Log section. Returns null
  // if no Decision Log heading is found.
  let headingIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^#{1,6}\s+.*Decision Log/i.test(line)) {
      headingIdx = i;
      break;
    }
  }
  if (headingIdx === -1) return null;

  // End is the next heading at the same or higher level, or end of file
  const headingMatch = lines[headingIdx].match(/^(#{1,6})\s/);
  const headingLevel = headingMatch ? headingMatch[1].length : 2;
  let endIdx = lines.length;
  for (let i = headingIdx + 1; i < lines.length; i++) {
    const m = lines[i].match(/^(#{1,6})\s/);
    if (m && m[1].length <= headingLevel) {
      endIdx = i;
      break;
    }
  }
  return { headingIdx, contentStart: headingIdx + 1, endIdx };
}

function parseEntries(lines, contentStart, endIdx) {
  // Walk the Decision Log content. Each entry starts with `- YYYY-MM-DD`. Continuation
  // lines (anything between two entry-start lines that doesn't start a new entry) are
  // attached to the previous entry. Blank lines and headings inside the section are
  // preserved as a "preamble" attached to the next entry, OR as a trailing tail.
  const entries = [];
  let currentEntry = null;
  let preambleBeforeFirstEntry = [];

  for (let i = contentStart; i < endIdx; i++) {
    const line = lines[i];
    if (ENTRY_START.test(line)) {
      if (currentEntry) entries.push(currentEntry);
      const dateMatch = line.match(ENTRY_START);
      currentEntry = {
        date: dateMatch[1],
        startLine: i,
        lines: [line],
      };
    } else if (currentEntry) {
      currentEntry.lines.push(line);
    } else {
      preambleBeforeFirstEntry.push(line);
    }
  }
  if (currentEntry) entries.push(currentEntry);

  return { entries, preambleBeforeFirstEntry };
}

function trimTrailingBlankLines(arr) {
  const out = [...arr];
  while (out.length && out[out.length - 1].trim() === '') out.pop();
  return out;
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function nextArchiveSeq(archiveDir) {
  if (!fs.existsSync(archiveDir)) return 1;
  const existing = fs
    .readdirSync(archiveDir)
    .map((f) => f.match(/^(\d{3})-/))
    .filter(Boolean)
    .map((m) => parseInt(m[1], 10));
  return existing.length === 0 ? 1 : Math.max(...existing) + 1;
}

function formatArchiveFile(seq, entries) {
  // entries is sorted oldest-first
  const firstDate = entries[0].date;
  const lastDate = entries[entries.length - 1].date;
  const seqStr = String(seq).padStart(3, '0');
  const fileName = `${seqStr}-${firstDate}.md`;
  const header = [
    `# Progress Archive ${seqStr}`,
    '',
    `**Date range**: ${firstDate} → ${lastDate}`,
    `**Entries**: ${entries.length}`,
    `**Generated**: ${new Date().toISOString().slice(0, 10)} by archive-progress.js`,
    '',
    '---',
    '',
    '## Decision Log',
    '',
  ];
  const body = entries.flatMap((e) => trimTrailingBlankLines(e.lines)).map((l) => l);
  // Insert blank line between entries for readability
  const formatted = [];
  for (let i = 0; i < entries.length; i++) {
    formatted.push(...trimTrailingBlankLines(entries[i].lines));
    if (i < entries.length - 1) formatted.push('');
  }
  return {
    fileName,
    content: header.concat(formatted, ['']).join('\n'),
    firstDate,
    lastDate,
    entryCount: entries.length,
  };
}

function rebuildIndex(archiveDir) {
  const files = fs
    .readdirSync(archiveDir)
    .filter((f) => /^\d{3}-\d{4}-\d{2}-\d{2}\.md$/.test(f))
    .sort();
  const lines = [
    '# Progress Archive Index',
    '',
    'Generated by `bin/archive-progress.js`. Each archive file holds a window of older Decision Log entries that have been rolled out of the live `progress.md`.',
    '',
    'To find historical context, scan this index for the relevant date range, then read the matching archive file.',
    '',
    '| File | Date range | Entries | Size |',
    '|------|------------|---------|------|',
  ];
  for (const f of files) {
    const fullPath = path.join(archiveDir, f);
    const content = fs.readFileSync(fullPath, 'utf8');
    const rangeMatch = content.match(/\*\*Date range\*\*:\s*(\d{4}-\d{2}-\d{2}) → (\d{4}-\d{2}-\d{2})/);
    const countMatch = content.match(/\*\*Entries\*\*:\s*(\d+)/);
    const stat = fs.statSync(fullPath);
    const sizeKB = (stat.size / 1024).toFixed(1);
    const range = rangeMatch ? `${rangeMatch[1]} → ${rangeMatch[2]}` : 'unknown';
    const count = countMatch ? countMatch[1] : '?';
    lines.push(`| [${f}](${f}) | ${range} | ${count} | ${sizeKB}KB |`);
  }
  lines.push('');
  return lines.join('\n');
}

function rebuildLiveProgress(originalLines, bounds, keptEntries, archivedCount, archiveDir) {
  // Rebuild progress.md with:
  //   - everything before the Decision Log heading (unchanged)
  //   - the Decision Log heading (unchanged)
  //   - a one-line pointer to the archive directory (if anything was archived)
  //   - the kept entries (newest first, matching how new entries are appended)
  //   - everything after the Decision Log section (unchanged)
  const before = originalLines.slice(0, bounds.headingIdx);
  const heading = originalLines[bounds.headingIdx];
  const after = originalLines.slice(bounds.endIdx);

  const archiveExists = fs.existsSync(archiveDir) &&
    fs.readdirSync(archiveDir).some((f) => /^\d{3}-/.test(f));

  const newDecisionLog = [];
  newDecisionLog.push(heading);
  newDecisionLog.push('');
  if (archiveExists) {
    const relPath = path.relative(path.dirname(bounds.progressPath || ''), archiveDir) || 'progress-archive';
    newDecisionLog.push(
      `> Older entries archived under \`${relPath}/\` — see \`${relPath}/INDEX.md\` for the date-range index.`
    );
    newDecisionLog.push('');
  }

  // keptEntries is oldest-first; emit in that order so the file reads top-to-bottom
  // chronologically, matching how it looked before archival.
  for (let i = 0; i < keptEntries.length; i++) {
    newDecisionLog.push(...trimTrailingBlankLines(keptEntries[i].lines));
    if (i < keptEntries.length - 1) newDecisionLog.push('');
  }
  newDecisionLog.push('');

  return [...before, ...newDecisionLog, ...after].join('\n');
}

function archiveProgress(opts) {
  const progressPath = path.join(opts.projectDir, '.gsd-t', 'progress.md');
  if (!fs.existsSync(progressPath)) {
    if (!opts.quiet) console.log(`(no progress.md at ${progressPath} — skipping)`);
    return { skipped: true };
  }

  const original = fs.readFileSync(progressPath, 'utf8');
  const lines = original.split('\n');
  const bounds = findDecisionLogBounds(lines);
  if (!bounds) {
    if (!opts.quiet) console.log('(no Decision Log section found — skipping)');
    return { skipped: true };
  }
  bounds.progressPath = progressPath;

  const { entries } = parseEntries(lines, bounds.contentStart, bounds.endIdx);

  if (entries.length <= opts.keepLive) {
    if (!opts.quiet) {
      console.log(
        `progress.md: ${entries.length} entries (≤ keep=${opts.keepLive}) — nothing to archive`
      );
    }
    return { skipped: true, entryCount: entries.length };
  }

  // Sort oldest-first so we archive the oldest tail
  entries.sort((a, b) => {
    if (a.date < b.date) return -1;
    if (a.date > b.date) return 1;
    return a.startLine - b.startLine;
  });

  const toArchive = entries.slice(0, entries.length - opts.keepLive);
  const toKeep = entries.slice(entries.length - opts.keepLive);

  const archiveDir = path.join(opts.projectDir, '.gsd-t', 'progress-archive');
  if (!opts.dryRun) ensureDir(archiveDir);

  // Pack archive entries into windows of opts.perArchive each
  const windows = [];
  for (let i = 0; i < toArchive.length; i += opts.perArchive) {
    windows.push(toArchive.slice(i, i + opts.perArchive));
  }

  const writtenFiles = [];
  let seq = opts.dryRun ? nextArchiveSeq(archiveDir) : nextArchiveSeq(archiveDir);
  for (const window of windows) {
    if (window.length === 0) continue;
    const formatted = formatArchiveFile(seq, window);
    const outPath = path.join(archiveDir, formatted.fileName);
    if (!opts.dryRun) fs.writeFileSync(outPath, formatted.content);
    writtenFiles.push({ name: formatted.fileName, count: window.length, range: `${formatted.firstDate} → ${formatted.lastDate}` });
    seq++;
  }

  if (!opts.dryRun) {
    const indexContent = rebuildIndex(archiveDir);
    fs.writeFileSync(path.join(archiveDir, 'INDEX.md'), indexContent);
  }

  // Now rebuild live progress.md with only the kept entries
  const newProgress = rebuildLiveProgress(lines, bounds, toKeep, toArchive.length, archiveDir);
  if (!opts.dryRun) fs.writeFileSync(progressPath, newProgress);

  if (!opts.quiet) {
    const beforeKB = (Buffer.byteLength(original, 'utf8') / 1024).toFixed(1);
    const afterKB = opts.dryRun
      ? '(dry-run)'
      : (Buffer.byteLength(newProgress, 'utf8') / 1024).toFixed(1) + 'KB';
    console.log(
      `${opts.dryRun ? '[DRY-RUN] ' : ''}progress.md: archived ${toArchive.length} entries → ${writtenFiles.length} archive file(s); kept ${toKeep.length} live`
    );
    for (const f of writtenFiles) {
      console.log(`  ${f.name}  (${f.count} entries, ${f.range})`);
    }
    console.log(`  size: ${beforeKB}KB → ${afterKB}`);
  }

  return {
    archived: toArchive.length,
    kept: toKeep.length,
    archiveFiles: writtenFiles,
    dryRun: opts.dryRun,
  };
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  try {
    const result = archiveProgress(opts);
    if (result.skipped) process.exit(0);
    process.exit(0);
  } catch (e) {
    console.error(`archive-progress: ERROR — ${e.message}`);
    if (process.env.DEBUG) console.error(e.stack);
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = { archiveProgress, parseEntries, findDecisionLogBounds };
