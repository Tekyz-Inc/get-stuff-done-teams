#!/usr/bin/env node
// Context Budget Audit — measures the static context cost of a Claude Code session
// before any user work happens. Reports tokens consumed by CLAUDE.md files, command
// files, MCP server tool descriptions, and skills. Used to diagnose why long-running
// sessions hit the manual compaction prompt.
//
// Usage:
//   node bin/context-budget-audit.js                  # current project + global
//   node bin/context-budget-audit.js --json           # JSON output for tooling
//   node bin/context-budget-audit.js --top 20         # top N largest files
//   node bin/context-budget-audit.js --threshold 5000 # flag files above N tokens

const fs = require('fs');
const path = require('path');
const os = require('os');

// Token estimation: GPT/Claude tokenizers average ~4 chars/token for English+code.
// This is a fast deterministic estimate, not a true tokenizer call. Within ~10%.
const CHARS_PER_TOKEN = 4;
const CONTEXT_WINDOW = 200_000; // claude-opus-4-6 default

function estimateTokens(bytes) {
  return Math.round(bytes / CHARS_PER_TOKEN);
}

function fmtPct(n) {
  return `${n.toFixed(1)}%`;
}

function fmtNum(n) {
  return n.toLocaleString('en-US');
}

function safeStat(p) {
  try {
    return fs.statSync(p);
  } catch {
    return null;
  }
}

function safeRead(p) {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch {
    return null;
  }
}

function listFiles(dir, ext = null) {
  if (!fs.existsSync(dir)) return [];
  try {
    return fs
      .readdirSync(dir)
      .filter((f) => !ext || f.endsWith(ext))
      .map((f) => path.join(dir, f))
      .filter((p) => {
        const s = safeStat(p);
        return s && s.isFile();
      });
  } catch {
    return [];
  }
}

function measureFile(filePath) {
  const stat = safeStat(filePath);
  if (!stat) return null;
  return {
    path: filePath,
    bytes: stat.size,
    tokens: estimateTokens(stat.size),
  };
}

function measureCategory(name, files, source) {
  const measured = files
    .map(measureFile)
    .filter(Boolean)
    .sort((a, b) => b.tokens - a.tokens);
  const totalBytes = measured.reduce((s, f) => s + f.bytes, 0);
  const totalTokens = measured.reduce((s, f) => s + f.tokens, 0);
  return {
    name,
    source,
    fileCount: measured.length,
    totalBytes,
    totalTokens,
    pctOfWindow: (totalTokens / CONTEXT_WINDOW) * 100,
    files: measured,
  };
}

// Estimate MCP tool descriptions cost — each deferred tool exposes a name + ~50-150
// chars of description in the system prompt. We can't read them directly, but we
// know the count from the list provided in conversation context (22 in this session).
function estimateMcpToolsCost(toolCount = 22, avgCharsPerTool = 120) {
  const bytes = toolCount * avgCharsPerTool;
  return {
    name: 'MCP deferred tool manifest (Figma + Gmail + Calendar)',
    source: '~/.claude/settings.json mcpServers (estimated)',
    fileCount: toolCount,
    totalBytes: bytes,
    totalTokens: estimateTokens(bytes),
    pctOfWindow: (estimateTokens(bytes) / CONTEXT_WINDOW) * 100,
    files: [],
  };
}

// Estimate built-in tool schemas cost — Read, Edit, Write, Bash, Glob, Grep, etc.
// These are loaded into every session. Approx based on their JSONSchema sizes.
function estimateBuiltinToolsCost() {
  // Top-of-prompt tools observed: Agent, Bash, Edit, Glob, Grep, Read, ScheduleWakeup,
  // Skill, ToolSearch, Write. Each is ~200-2000 tokens in JSONSchema form.
  const tools = {
    Agent: 1800,
    Bash: 2200,
    Edit: 600,
    Glob: 300,
    Grep: 800,
    Read: 700,
    ScheduleWakeup: 900,
    Skill: 400,
    ToolSearch: 500,
    Write: 400,
  };
  const totalTokens = Object.values(tools).reduce((s, t) => s + t, 0);
  return {
    name: 'Built-in tool schemas (top-of-prompt)',
    source: 'Claude Code system prompt (estimated)',
    fileCount: Object.keys(tools).length,
    totalBytes: totalTokens * CHARS_PER_TOKEN,
    totalTokens,
    pctOfWindow: (totalTokens / CONTEXT_WINDOW) * 100,
    files: [],
  };
}

// Estimate Claude Code system prompt overhead — the harness instructions, env block,
// system reminders, gitStatus, etc. Observed in the prompt header.
function estimateSystemPromptCost() {
  // The system prompt header (everything before "You are an interactive agent") plus
  // the doing-tasks/tone-style/session-guidance sections is ~6000-8000 tokens.
  const tokens = 7000;
  return {
    name: 'Claude Code system prompt (instructions, env, gitStatus)',
    source: 'Claude Code harness',
    fileCount: 1,
    totalBytes: tokens * CHARS_PER_TOKEN,
    totalTokens: tokens,
    pctOfWindow: (tokens / CONTEXT_WINDOW) * 100,
    files: [],
  };
}

function audit({ projectDir, globalDir, top = 10, threshold = 0 }) {
  const categories = [];

  // 1. System prompt overhead
  categories.push(estimateSystemPromptCost());

  // 2. Built-in tool schemas
  categories.push(estimateBuiltinToolsCost());

  // 3. MCP deferred tool manifest
  categories.push(estimateMcpToolsCost());

  // 4. Global CLAUDE.md
  const globalClaude = path.join(globalDir, 'CLAUDE.md');
  if (fs.existsSync(globalClaude)) {
    categories.push(measureCategory('Global ~/.claude/CLAUDE.md', [globalClaude], globalClaude));
  }

  // 5. Project CLAUDE.md
  const projectClaude = path.join(projectDir, 'CLAUDE.md');
  if (fs.existsSync(projectClaude)) {
    categories.push(measureCategory('Project CLAUDE.md', [projectClaude], projectClaude));
  }

  // 6. Auto-memory (MEMORY.md + entries)
  const memoryDir = path.join(
    globalDir,
    'projects',
    `-${projectDir.replace(/\//g, '-').replace(/^-/, '')}`,
    'memory'
  );
  if (fs.existsSync(memoryDir)) {
    const memFiles = listFiles(memoryDir, '.md');
    categories.push(measureCategory('Auto-memory (MEMORY.md + entries)', memFiles, memoryDir));
  }

  // 7. Installed user commands — IMPORTANT: Claude Code's skill system loads only
  //    the manifest (name + first-line description) into the system prompt for each
  //    command file. The full body loads only when the skill is invoked. So the
  //    static cost is much smaller than the file size suggests — roughly ~150 chars
  //    per command (name + description) regardless of body length.
  const userCommandsDir = path.join(globalDir, 'commands');
  if (fs.existsSync(userCommandsDir)) {
    const cmdFiles = listFiles(userCommandsDir, '.md');
    const manifestBytesPerCmd = 200; // typical "- name: <desc>" line
    const manifestBytes = cmdFiles.length * manifestBytesPerCmd;
    const fullBodyBytes = cmdFiles.reduce((s, f) => {
      const st = safeStat(f);
      return s + (st ? st.size : 0);
    }, 0);
    categories.push({
      name: 'User commands MANIFEST (~/.claude/commands/ — names+descriptions only)',
      source: userCommandsDir,
      fileCount: cmdFiles.length,
      totalBytes: manifestBytes,
      totalTokens: estimateTokens(manifestBytes),
      pctOfWindow: (estimateTokens(manifestBytes) / CONTEXT_WINDOW) * 100,
      files: cmdFiles
        .map((p) => {
          const st = safeStat(p);
          return st
            ? { path: p, bytes: manifestBytesPerCmd, tokens: estimateTokens(manifestBytesPerCmd) }
            : null;
        })
        .filter(Boolean),
    });
    // Also report what the FULL bodies cost when invoked, so trimming targets are visible
    categories.push({
      name: 'User command FULL BODIES (loaded only when each skill is invoked)',
      source: userCommandsDir + ' (per-invocation cost, not baseline)',
      fileCount: cmdFiles.length,
      totalBytes: fullBodyBytes,
      totalTokens: estimateTokens(fullBodyBytes),
      pctOfWindow: (estimateTokens(fullBodyBytes) / CONTEXT_WINDOW) * 100,
      files: cmdFiles.map(measureFile).filter(Boolean).sort((a, b) => b.tokens - a.tokens),
      lazyLoaded: true,
    });
  }

  // 8. Project commands — same lazy-load semantics as user commands. Only count if
  //    it's a different directory AND the user's project actually exposes them as
  //    skills (most projects don't).
  const projectCommandsDir = path.join(projectDir, 'commands');
  if (
    fs.existsSync(projectCommandsDir) &&
    path.resolve(projectCommandsDir) !== path.resolve(userCommandsDir)
  ) {
    const cmdFiles = listFiles(projectCommandsDir, '.md');
    const manifestBytesPerCmd = 200;
    const manifestBytes = cmdFiles.length * manifestBytesPerCmd;
    const fullBodyBytes = cmdFiles.reduce((s, f) => {
      const st = safeStat(f);
      return s + (st ? st.size : 0);
    }, 0);
    categories.push({
      name: 'Project commands MANIFEST (commands/ — names+descriptions only)',
      source: projectCommandsDir,
      fileCount: cmdFiles.length,
      totalBytes: manifestBytes,
      totalTokens: estimateTokens(manifestBytes),
      pctOfWindow: (estimateTokens(manifestBytes) / CONTEXT_WINDOW) * 100,
      files: [],
    });
    categories.push({
      name: 'Project command FULL BODIES (per-invocation, not baseline)',
      source: projectCommandsDir,
      fileCount: cmdFiles.length,
      totalBytes: fullBodyBytes,
      totalTokens: estimateTokens(fullBodyBytes),
      pctOfWindow: (estimateTokens(fullBodyBytes) / CONTEXT_WINDOW) * 100,
      files: cmdFiles.map(measureFile).filter(Boolean).sort((a, b) => b.tokens - a.tokens),
      lazyLoaded: true,
    });
  }

  // 9. Project skills directory (if any)
  const skillsDir = path.join(globalDir, 'skills');
  if (fs.existsSync(skillsDir)) {
    const skillFiles = listFiles(skillsDir, '.md');
    if (skillFiles.length > 0) {
      categories.push(measureCategory('Skills (~/.claude/skills/)', skillFiles, skillsDir));
    }
  }

  // Compute totals — exclude lazy-loaded categories from the baseline cost
  const baselineCats = categories.filter((c) => !c.lazyLoaded);
  const totalTokens = baselineCats.reduce((s, c) => s + c.totalTokens, 0);
  const totalBytes = baselineCats.reduce((s, c) => s + c.totalBytes, 0);
  const totalPct = (totalTokens / CONTEXT_WINDOW) * 100;
  const remaining = CONTEXT_WINDOW - totalTokens;

  return {
    contextWindow: CONTEXT_WINDOW,
    totalBytes,
    totalTokens,
    totalPct,
    remaining,
    remainingPct: (remaining / CONTEXT_WINDOW) * 100,
    categories,
    top,
    threshold,
  };
}

function renderReport(result) {
  const lines = [];
  const bar = (pct, width = 40) => {
    const filled = Math.round((pct / 100) * width);
    return '█'.repeat(Math.min(filled, width)) + '░'.repeat(Math.max(width - filled, 0));
  };

  lines.push('');
  lines.push('═══════════════════════════════════════════════════════════════════');
  lines.push('  CONTEXT BUDGET AUDIT — what consumes context before you type');
  lines.push('═══════════════════════════════════════════════════════════════════');
  lines.push('');
  lines.push(`  Context window:        ${fmtNum(result.contextWindow)} tokens`);
  lines.push(`  Static preamble cost:  ${fmtNum(result.totalTokens)} tokens (${fmtPct(result.totalPct)})`);
  lines.push(`  Remaining for work:    ${fmtNum(result.remaining)} tokens (${fmtPct(result.remainingPct)})`);
  lines.push('');
  lines.push(`  [${bar(result.totalPct)}] ${fmtPct(result.totalPct)}`);
  lines.push('');

  if (result.totalPct >= 70) {
    lines.push('  🔴 CRITICAL: preamble already consumes >70% of context window.');
    lines.push('     Long-running tasks will trigger manual /compact prompts.');
  } else if (result.totalPct >= 50) {
    lines.push('  ⚠️  WARNING: preamble consumes >50% of context window.');
    lines.push('     Single-pass edits on large files may trigger compaction.');
  } else if (result.totalPct >= 30) {
    lines.push('  ⚡ ELEVATED: preamble consumes >30% of context window.');
    lines.push('     Multi-step workflows may approach compaction threshold.');
  } else {
    lines.push('  ✅ HEALTHY: preamble consumes <30% of context window.');
  }
  lines.push('');
  lines.push('───────────────────────────────────────────────────────────────────');
  lines.push('  BREAKDOWN BY CATEGORY (largest first)');
  lines.push('───────────────────────────────────────────────────────────────────');
  lines.push('');

  const sortedCats = [...result.categories].sort((a, b) => b.totalTokens - a.totalTokens);
  for (const cat of sortedCats) {
    const tag = cat.lazyLoaded ? ' [LAZY — not in baseline]' : '';
    lines.push(`  ${cat.name}${tag}`);
    lines.push(`    source: ${cat.source}`);
    lines.push(
      `    files: ${cat.fileCount}   bytes: ${fmtNum(cat.totalBytes)}   tokens: ${fmtNum(cat.totalTokens)} (${fmtPct(cat.pctOfWindow)})`
    );
    lines.push(`    [${bar(cat.pctOfWindow, 30)}]`);
    lines.push('');
  }

  // Top N files across all categories
  const allFiles = result.categories
    .flatMap((c) => c.files)
    .sort((a, b) => b.tokens - a.tokens);
  if (allFiles.length > 0) {
    lines.push('───────────────────────────────────────────────────────────────────');
    lines.push(`  TOP ${result.top} HEAVIEST FILES`);
    lines.push('───────────────────────────────────────────────────────────────────');
    lines.push('');
    const topFiles = allFiles.slice(0, result.top);
    for (const f of topFiles) {
      const pct = (f.tokens / CONTEXT_WINDOW) * 100;
      const flag = pct >= 5 ? ' 🔥' : pct >= 2 ? ' ⚠️' : '';
      const rel = f.path.replace(os.homedir(), '~');
      lines.push(`  ${fmtNum(f.tokens).padStart(7)} tok  ${fmtPct(pct).padStart(6)}  ${rel}${flag}`);
    }
    lines.push('');
  }

  // Files above threshold
  if (result.threshold > 0) {
    const above = allFiles.filter((f) => f.tokens >= result.threshold);
    if (above.length > 0) {
      lines.push('───────────────────────────────────────────────────────────────────');
      lines.push(`  FILES ABOVE THRESHOLD (>= ${fmtNum(result.threshold)} tokens)`);
      lines.push('───────────────────────────────────────────────────────────────────');
      lines.push('');
      for (const f of above) {
        const rel = f.path.replace(os.homedir(), '~');
        lines.push(`  ${fmtNum(f.tokens).padStart(7)} tok  ${rel}`);
      }
      lines.push('');
    }
  }

  lines.push('───────────────────────────────────────────────────────────────────');
  lines.push('  NOTES');
  lines.push('───────────────────────────────────────────────────────────────────');
  lines.push('');
  lines.push('  - Token estimate uses 4 chars/token (within ~10% of real tokenizer).');
  lines.push('  - "Static preamble" = everything loaded BEFORE you type your first');
  lines.push('    message. Add ~10-20K tokens of typical conversation overhead.');
  lines.push('  - Skills auto-load into the prompt as a list of names+descriptions.');
  lines.push('    Their full bodies are loaded only when invoked, but the manifest');
  lines.push('    itself contributes to baseline.');
  lines.push('  - Built-in and MCP tool costs are estimates; real values vary by');
  lines.push('    Claude Code version. Check ENABLE_TELEMETRY for exact counts.');
  lines.push('');

  return lines.join('\n');
}

function main() {
  const args = process.argv.slice(2);
  const opts = {
    projectDir: process.cwd(),
    globalDir: path.join(os.homedir(), '.claude'),
    top: 10,
    threshold: 0,
    json: false,
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--json') opts.json = true;
    else if (a === '--top') opts.top = parseInt(args[++i], 10);
    else if (a === '--threshold') opts.threshold = parseInt(args[++i], 10);
    else if (a === '--project') opts.projectDir = path.resolve(args[++i]);
    else if (a === '--global') opts.globalDir = path.resolve(args[++i]);
    else if (a === '--help' || a === '-h') {
      console.log('Usage: node bin/context-budget-audit.js [--json] [--top N] [--threshold N]');
      process.exit(0);
    }
  }

  const result = audit(opts);

  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(renderReport(result));
  }
}

main();
