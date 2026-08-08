#!/usr/bin/env node
/**
 * gsd-t-changelog-post-edit.js
 *
 * PostToolUse hook for Write|Edit: after a successful write to CLAUDE.md,
 * reminds Claude to update the changelog.
 *
 * Receives JSON on stdin with tool_input containing file_path.
 * Outputs reminder text to stdout if the target was CLAUDE.md.
 *
 * Does NOT auto-append — Claude should consciously decide what changed and
 * call the append command with appropriate bullets.
 */

const fs = require('fs');
const path = require('path');

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  let data;
  try {
    data = JSON.parse(input);
  } catch {
    process.exit(0);
  }

  // Get the file path from tool_input
  const toolInput = data.tool_input;
  if (!toolInput) {
    process.exit(0);
  }

  let filePath;
  if (typeof toolInput === 'string') {
    try {
      const parsed = JSON.parse(toolInput);
      filePath = parsed.file_path;
    } catch {
      process.exit(0);
    }
  } else if (typeof toolInput === 'object') {
    filePath = toolInput.file_path;
  }

  if (!filePath) {
    process.exit(0);
  }

  // Check if it's CLAUDE.md (root or .claude/)
  const basename = path.basename(filePath);
  if (basename !== 'CLAUDE.md') {
    process.exit(0);
  }

  // Check if it's NOT the global ~/.claude/CLAUDE.md (only track project CLAUDE.md)
  const homeClaudeMd = path.join(process.env.HOME || '', '.claude', 'CLAUDE.md');
  if (path.resolve(filePath) === path.resolve(homeClaudeMd)) {
    process.exit(0);
  }

  // It's a project CLAUDE.md — remind to update changelog
  const projectDir = data.cwd || process.cwd();
  const changelogPath = path.join(projectDir, 'CLAUDE.md updates.md');

  process.stdout.write(
    `[M110] You just modified CLAUDE.md. Update the changelog:\n` +
    `  node bin/gsd-t-claude-md-changelog.cjs append "${projectDir}" updated "" '["<describe what changed>"]'\n`
  );

  process.exit(0);
});
