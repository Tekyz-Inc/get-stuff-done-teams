/**
 * gsd-t-unattended-safety.js
 *
 * Pure-function safety rails for the unattended supervisor.
 *
 * Contract: .gsd-t/contracts/unattended-supervisor-contract.md v1.0.0
 *   §5  — Exit code table (2 = preflight-failure, 7 = protected-branch-refusal,
 *         8 = dirty-tree-refusal)
 *   §12 — Safety Rails Hook Points
 *   §13 — Configuration File schema (DEFAULTS authoritative source)
 *
 * This module exports synchronous, side-effect-light check functions called
 * by the supervisor between worker spawns. Each check returns
 *   { ok: true }                                    on allow
 *   { ok: false, reason: string, code: number }    on refuse
 *
 * The only permitted side effects are:
 *   - reading git state via `git branch --show-current` and `git status --porcelain`
 *   - reading the optional config file at `.gsd-t/.unattended/config.json`
 *
 * Zero external dependencies — Node built-ins only.
 *
 * Owner: m36-safety-rails
 */

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

// ── DEFAULTS ────────────────────────────────────────────────────────────────
//
// Source of truth: unattended-supervisor-contract.md §13.
// Any drift here from the contract is a contract violation.

const DEFAULTS = Object.freeze({
  protectedBranches: [
    "main",
    "master",
    "develop",
    "trunk",
    "release/*",
    "hotfix/*",
  ],
  dirtyTreeWhitelist: [
    ".gsd-t/heartbeat-*.jsonl",
    ".gsd-t/.context-meter-state.json",
    ".gsd-t/events/*.jsonl",
    ".gsd-t/token-metrics.jsonl",
    ".gsd-t/token-log.md",
    ".gsd-t/.unattended/*",
    ".gsd-t/.handoff/*",
    ".claude/settings.local.json",
    ".claude/settings.local.json.bak*",
  ],
  maxIterations: 200,
  hours: 24,
  gutterNoProgressIters: 5,
  workerTimeoutMs: 270000,
});

// ── Glob → regex helper ─────────────────────────────────────────────────────
//
// Minimal glob matcher: `*` matches any run of characters except `/`,
// `**` matches across path separators, everything else is a literal.
// No external dependency. Sufficient for the whitelist patterns in §13.

function globToRegex(glob) {
  let re = "^";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        re += ".*";
        i++;
      } else {
        re += "[^/]*";
      }
    } else if (c === "?") {
      re += "[^/]";
    } else if ("\\^$+.()|{}[]".includes(c)) {
      re += "\\" + c;
    } else {
      re += c;
    }
  }
  re += "$";
  return new RegExp(re);
}

function matchesAnyGlob(value, patterns) {
  for (const pattern of patterns) {
    if (globToRegex(pattern).test(value)) return true;
  }
  return false;
}

// ── loadConfig ──────────────────────────────────────────────────────────────
//
// Reads `.gsd-t/.unattended/config.json` if present, merges field-by-field
// over DEFAULTS, returns a plain object. Missing file → return a deep copy
// of DEFAULTS unchanged. Malformed JSON → throws a clear Error.

function cloneDefaults() {
  // Defensive deep copy so callers can mutate the result without poisoning
  // the frozen DEFAULTS singleton.
  return {
    protectedBranches: DEFAULTS.protectedBranches.slice(),
    dirtyTreeWhitelist: DEFAULTS.dirtyTreeWhitelist.slice(),
    maxIterations: DEFAULTS.maxIterations,
    hours: DEFAULTS.hours,
    gutterNoProgressIters: DEFAULTS.gutterNoProgressIters,
    workerTimeoutMs: DEFAULTS.workerTimeoutMs,
  };
}

function loadConfig(projectDir) {
  const merged = cloneDefaults();
  const configPath = path.join(
    projectDir,
    ".gsd-t",
    ".unattended",
    "config.json",
  );
  if (!fs.existsSync(configPath)) return merged;

  let raw;
  try {
    raw = fs.readFileSync(configPath, "utf8");
  } catch (err) {
    throw new Error(
      `safety-rails: failed to read config at ${configPath}: ${err.message}`,
    );
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `safety-rails: malformed JSON in ${configPath}: ${err.message}`,
    );
  }

  if (parsed && typeof parsed === "object") {
    for (const key of Object.keys(merged)) {
      if (parsed[key] !== undefined) {
        merged[key] = parsed[key];
      }
    }
  }
  return merged;
}

// ── saveConfig ─────────────────────────────────────────────────────────────
//
// Persists the given config object back to `.gsd-t/.unattended/config.json`.
// Creates the directory if missing. Used by auto-whitelist to remember newly
// whitelisted dirty-tree entries so subsequent launches don't re-warn.

function saveConfig(projectDir, config) {
  const configDir = path.join(projectDir, ".gsd-t", ".unattended");
  const configPath = path.join(configDir, "config.json");
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }
  const serializable = {};
  for (const key of Object.keys(DEFAULTS)) {
    if (config[key] !== undefined) {
      serializable[key] = config[key];
    }
  }
  fs.writeFileSync(configPath, JSON.stringify(serializable, null, 2) + "\n");
}

// ── checkGitBranch ──────────────────────────────────────────────────────────
//
// Runs `git branch --show-current` in projectDir. An empty result indicates
// detached HEAD, which is treated as a protected-branch refusal (you cannot
// safely run unattended on a detached HEAD — there's no branch to push to).
// Otherwise, the current branch is matched against the protectedBranches
// list using glob semantics. Match → refuse with code 7.

function checkGitBranch(projectDir, config) {
  const cfg = config || loadConfig(projectDir);
  const result = spawnSync("git", ["branch", "--show-current"], {
    cwd: projectDir,
    encoding: "utf8",
  });

  if (result.error) {
    return {
      ok: false,
      reason: `git branch --show-current failed: ${result.error.message}`,
      code: 2,
    };
  }
  if (result.status !== 0) {
    return {
      ok: false,
      reason:
        `git branch --show-current exited ${result.status}: ` +
        (result.stderr || "").trim(),
      code: 2,
    };
  }

  const branch = (result.stdout || "").trim();
  if (!branch) {
    // Detached HEAD: refuse as protected.
    return {
      ok: false,
      reason: "detached HEAD: refusing to run unattended without a branch",
      code: 7,
      branch: "",
    };
  }

  if (matchesAnyGlob(branch, cfg.protectedBranches)) {
    return {
      ok: false,
      reason: `branch '${branch}' is protected (matches one of: ${cfg.protectedBranches.join(", ")})`,
      code: 7,
      branch,
    };
  }

  return { ok: true, branch };
}

// ── checkWorktreeCleanliness ────────────────────────────────────────────────
//
// Runs `git status --porcelain`, parses each line, filters whitelisted files
// per dirtyTreeWhitelist (glob-aware). If any non-whitelisted dirty file
// remains, refuse with code 8 and report the offenders.
//
// Fail-closed: any git failure → code 2 preflight-failure.

function parsePorcelainLine(line) {
  // Porcelain v1 line shape: "XY path" (XY are 2 status chars, then a space).
  // Renames look like "R  old -> new" — return the destination path.
  if (line.length < 4) return null;
  let payload = line.slice(3);
  const arrow = payload.indexOf(" -> ");
  if (arrow !== -1) payload = payload.slice(arrow + 4);
  // Strip optional surrounding quotes that git uses for special chars.
  if (payload.startsWith('"') && payload.endsWith('"')) {
    payload = payload.slice(1, -1);
  }
  return payload;
}

function checkWorktreeCleanliness(projectDir, config) {
  const cfg = config || loadConfig(projectDir);
  // `--untracked-files=all` expands untracked directories to individual file
  // paths. Without this, git would summarize new dirs as ".gsd-t/" and we'd
  // refuse a tree even when every file inside is whitelisted.
  const result = spawnSync(
    "git",
    ["status", "--porcelain", "--untracked-files=all"],
    { cwd: projectDir, encoding: "utf8" },
  );

  if (result.error) {
    return {
      ok: false,
      reason: `git status --porcelain failed: ${result.error.message}`,
      code: 2,
    };
  }
  if (result.status !== 0) {
    return {
      ok: false,
      reason:
        `git status --porcelain exited ${result.status}: ` +
        (result.stderr || "").trim(),
      code: 2,
    };
  }

  const stdout = (result.stdout || "").replace(/\r\n/g, "\n");
  const lines = stdout.split("\n").filter((l) => l.length > 0);

  const dirtyFiles = [];
  for (const line of lines) {
    const file = parsePorcelainLine(line);
    if (!file) continue;
    if (!matchesAnyGlob(file, cfg.dirtyTreeWhitelist)) {
      dirtyFiles.push(file);
    }
  }

  if (dirtyFiles.length > 0) {
    return {
      ok: false,
      reason:
        `worktree has ${dirtyFiles.length} non-whitelisted dirty file(s): ` +
        dirtyFiles.slice(0, 5).join(", ") +
        (dirtyFiles.length > 5 ? ", …" : ""),
      code: 8,
      dirtyFiles,
    };
  }

  return { ok: true };
}

// ── checkIterationCap ───────────────────────────────────────────────────────
//
// Pre-worker hook: refuses to spawn another worker if the iteration count has
// reached the configured cap. Contract §12 lists this under the pre-worker
// hook. The cap is resolved with the precedence:
//   1. config.maxIterations (explicit override)
//   2. DEFAULTS.maxIterations (hardcoded contract default)
//   3. state.maxIterations (fallback — what the supervisor was launched with)
//
// Iteration cap is a soft gutter (not a crash), so it surfaces as code 6
// per contract §5.

function checkIterationCap(state, config) {
  const cap =
    (config && typeof config.maxIterations === "number"
      ? config.maxIterations
      : undefined) ??
    DEFAULTS.maxIterations ??
    (state && state.maxIterations);

  if (typeof cap !== "number" || !Number.isFinite(cap)) {
    return {
      ok: false,
      reason: "iteration cap is not a finite number",
      code: 2,
    };
  }

  const iter = state && typeof state.iter === "number" ? state.iter : 0;
  if (iter < cap) {
    return { ok: true };
  }
  return {
    ok: false,
    reason: `iteration cap exceeded: iter=${iter} >= maxIterations=${cap}`,
    code: 6,
    iter,
    maxIterations: cap,
  };
}

// ── checkWallClockCap ───────────────────────────────────────────────────────
//
// Pre-worker hook: refuses to spawn another worker if the total elapsed wall
// clock time has reached the configured hours cap. The cap is resolved with
// the precedence:
//   1. config.hours (explicit override)
//   2. DEFAULTS.hours (hardcoded contract default — 24)
//
// wallClockElapsedMs is an integer on state.json (§3). The cap is converted
// to milliseconds for comparison. Wall-clock cap is a soft gutter → code 6.

function checkWallClockCap(state, config) {
  const hours =
    config && typeof config.hours === "number"
      ? config.hours
      : DEFAULTS.hours;

  if (typeof hours !== "number" || !Number.isFinite(hours) || hours <= 0) {
    return {
      ok: false,
      reason: "wall-clock cap (hours) is not a positive finite number",
      code: 2,
    };
  }

  const capMs = hours * 3600 * 1000;
  const elapsedMs =
    state && typeof state.wallClockElapsedMs === "number"
      ? state.wallClockElapsedMs
      : 0;

  if (elapsedMs < capMs) {
    return { ok: true };
  }
  return {
    ok: false,
    reason:
      `wall-clock cap exceeded: elapsedMs=${elapsedMs} >= capMs=${capMs} ` +
      `(hours=${hours})`,
    code: 6,
    elapsedMs,
    capMs,
  };
}

// ── validateState ───────────────────────────────────────────────────────────
//
// Pure schema validator for state.json. Checks every REQUIRED field from
// contract §3, verifies types, and validates the status enum from §4.
//
// Aggregates errors (does NOT fail-fast) so the caller can surface every
// problem in a single preflight refusal. Returns code 2 (preflight-failure)
// per contract §5 on any failure.

const STATUS_ENUM = Object.freeze([
  "initializing",
  "running",
  "done",
  "failed",
  "stopped",
  "crashed",
]);

const PLATFORM_ENUM = Object.freeze(["darwin", "linux", "win32"]);

// Required fields per contract §3, with an expected-type tag. We check the
// supervisor-critical fields listed in the Task 2 acceptance criteria.
const REQUIRED_STATE_FIELDS = Object.freeze([
  { name: "version", type: "string" },
  { name: "sessionId", type: "string" },
  { name: "projectDir", type: "string" },
  { name: "status", type: "string" }, // enum-validated below
  { name: "milestone", type: "string" },
  { name: "iter", type: "integer" },
  { name: "maxIterations", type: "integer" },
  { name: "startedAt", type: "string" },
  { name: "lastTick", type: "string" },
  { name: "hours", type: "number" },
  { name: "wallClockElapsedMs", type: "integer" },
  { name: "supervisorPid", type: "integer" },
  { name: "logPath", type: "string" },
  { name: "platform", type: "string" }, // enum-validated below
  { name: "claudeBin", type: "string" },
]);

function typeMatches(value, expected) {
  if (value === undefined || value === null) return false;
  switch (expected) {
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "integer":
      return (
        typeof value === "number" &&
        Number.isFinite(value) &&
        Number.isInteger(value)
      );
    default:
      return false;
  }
}

function validateState(state) {
  const errors = [];

  if (!state || typeof state !== "object" || Array.isArray(state)) {
    return {
      ok: false,
      code: 2,
      reason: "state-validation-failed",
      errors: ["state must be a non-null object"],
    };
  }

  for (const field of REQUIRED_STATE_FIELDS) {
    if (!(field.name in state)) {
      errors.push(`${field.name}: missing required field`);
      continue;
    }
    const value = state[field.name];
    if (!typeMatches(value, field.type)) {
      errors.push(
        `${field.name}: expected ${field.type}, got ${
          value === null ? "null" : typeof value
        }`,
      );
    }
  }

  // Status enum check — only if the field was present and a string. Skip if
  // we already flagged it as a type error to avoid double reporting.
  if (typeof state.status === "string" && !STATUS_ENUM.includes(state.status)) {
    errors.push(
      `status: invalid enum value '${state.status}' (expected one of: ${STATUS_ENUM.join(", ")})`,
    );
  }

  // Platform enum check.
  if (
    typeof state.platform === "string" &&
    !PLATFORM_ENUM.includes(state.platform)
  ) {
    errors.push(
      `platform: invalid enum value '${state.platform}' (expected one of: ${PLATFORM_ENUM.join(", ")})`,
    );
  }

  // Value sanity — only if the field was present and numeric.
  if (typeof state.iter === "number" && Number.isInteger(state.iter) && state.iter < 0) {
    errors.push(`iter: must be >= 0, got ${state.iter}`);
  }
  if (
    typeof state.maxIterations === "number" &&
    Number.isInteger(state.maxIterations) &&
    state.maxIterations <= 0
  ) {
    errors.push(
      `maxIterations: must be > 0, got ${state.maxIterations}`,
    );
  }
  if (
    typeof state.wallClockElapsedMs === "number" &&
    Number.isInteger(state.wallClockElapsedMs) &&
    state.wallClockElapsedMs < 0
  ) {
    errors.push(
      `wallClockElapsedMs: must be >= 0, got ${state.wallClockElapsedMs}`,
    );
  }

  if (errors.length > 0) {
    return {
      ok: false,
      code: 2,
      reason: "state-validation-failed",
      errors,
    };
  }

  return { ok: true };
}

// ── detectGutter ────────────────────────────────────────────────────────────
//
// Post-worker hook: scans the tail of run.log plus the supervisor state for
// three stall patterns. A positive detection returns code 6 (gutter-detected)
// per contract §5. Pure function — NO filesystem reads. The caller is
// responsible for passing the run-log tail as a string (typically last ~200
// lines) and the current state object.
//
// The three patterns:
//
//   1. repeated-error
//      Extract error lines (regex /error[:\s].*$/im) grouped by iteration
//      block (headers of the form "--- ITER N ---"). If the same error
//      signature appears in the last `gutterThreshold` (default 3) consecutive
//      iteration blocks, flag it.
//
//   2. file-thrash
//      Count `Edit(`/`Write(` tool operations per file across iteration
//      blocks. Heuristic: if the top file appears in >= `gutterThreshold`
//      iterations AND accounts for a dominant share of edits, flag it. This
//      is intentionally a cheap approximation — see §12 of the contract which
//      lists gutter detection as implementation-owned.
//
//   3. no-progress
//      If the caller passes `state.progressHash` and `state.progressHashHistory`
//      (an array of the last N hashes, one per iter), and the last
//      `gutterWindow` (default 5) hashes are all identical AND state.iter has
//      advanced by at least `gutterWindow`, flag it. Callers without history
//      can omit this signal and the function will skip the no-progress check
//      (low false-positive design).
//
// Config fields consumed (all optional):
//   - gutterThreshold       (default 3)  — min consecutive iters for pattern
//   - gutterWindow          (default 5)  — lookback window for no-progress
//   - gutterNoProgressIters (default 5)  — alias for gutterWindow from §13

const ITER_HEADER_RE = /^---\s*ITER\s+(\d+)\s*---/im;

function splitIterBlocks(runLogTail) {
  // Split the tail into blocks keyed by the "--- ITER N ---" header. Content
  // before the first header is discarded (it belongs to an iteration we don't
  // have full visibility into).
  if (typeof runLogTail !== "string" || runLogTail.length === 0) return [];
  const lines = runLogTail.split(/\r?\n/);
  const blocks = [];
  let current = null;
  for (const line of lines) {
    const m = line.match(ITER_HEADER_RE);
    if (m) {
      if (current) blocks.push(current);
      current = { iter: Number(m[1]), lines: [] };
    } else if (current) {
      current.lines.push(line);
    }
  }
  if (current) blocks.push(current);
  return blocks;
}

// Extract the first error-looking line from a block and normalize it into a
// signature for equality comparison. Returns null if no error line found.
function extractErrorSignature(block) {
  for (const line of block.lines) {
    const m = line.match(/error[:\s]+(.+)$/i);
    if (m) {
      // Normalize whitespace and strip volatile numeric/path suffixes so that
      // two errors that differ only by line number still match.
      return m[1]
        .replace(/\s+/g, " ")
        .replace(/\b\d+\b/g, "N")
        .replace(/[/\\][\w./\\-]+/g, "PATH")
        .trim()
        .slice(0, 200);
    }
  }
  return null;
}

// Count `Edit(path=...)` / `Write(file_path=...)` mentions per file in a
// block. The exact tool-call serialization isn't standardized, so we fall back
// to a loose match: `(Edit|Write)\s*\(\s*(?:file_path|path)?\s*=?\s*['"]([^'"]+)['"]`
const TOOL_CALL_RE =
  /(?:Edit|Write)\s*\(\s*(?:file_path|path)?\s*=?\s*['"]([^'"]+)['"]/gi;

function extractEditedFiles(block) {
  const files = new Set();
  const text = block.lines.join("\n");
  let m;
  while ((m = TOOL_CALL_RE.exec(text)) !== null) {
    files.add(m[1]);
  }
  return files;
}

function detectGutter(state, runLogTail, config) {
  const cfg = config || {};
  const threshold =
    typeof cfg.gutterThreshold === "number" && cfg.gutterThreshold > 0
      ? cfg.gutterThreshold
      : 3;
  const window =
    typeof cfg.gutterWindow === "number" && cfg.gutterWindow > 0
      ? cfg.gutterWindow
      : typeof cfg.gutterNoProgressIters === "number" &&
          cfg.gutterNoProgressIters > 0
        ? cfg.gutterNoProgressIters
        : DEFAULTS.gutterNoProgressIters;

  const blocks = splitIterBlocks(runLogTail || "");

  // ── Pattern 1: repeated-error ─────────────────────────────────────────────
  if (blocks.length >= threshold) {
    const recent = blocks.slice(-threshold);
    const sigs = recent.map(extractErrorSignature);
    if (sigs.every((s) => s !== null) && sigs.every((s) => s === sigs[0])) {
      return {
        ok: false,
        code: 6,
        reason: "gutter-detected",
        pattern: "repeated-error",
        details: {
          signature: sigs[0],
          consecutiveIters: threshold,
          iters: recent.map((b) => b.iter),
        },
      };
    }
  }

  // ── Pattern 2: file-thrash ────────────────────────────────────────────────
  // Heuristic: for each file, count how many of the last `threshold` blocks
  // it was edited in. If any file appears in ALL `threshold` recent blocks AND
  // the top file accounts for a dominant share of edits (>= 50% of total
  // file-block pairs), flag it. This catches "keeps editing the same 2-3
  // files over and over" stalls without firing on normal healthy multi-file
  // churn.
  if (blocks.length >= threshold) {
    const recent = blocks.slice(-threshold);
    const fileCounts = new Map(); // file -> number of blocks it appears in
    let totalPairs = 0;
    for (const block of recent) {
      const files = extractEditedFiles(block);
      for (const f of files) {
        fileCounts.set(f, (fileCounts.get(f) || 0) + 1);
        totalPairs += 1;
      }
    }
    // Find files that appear in every block.
    const persistent = Array.from(fileCounts.entries())
      .filter(([, count]) => count >= threshold)
      .sort((a, b) => b[1] - a[1]);
    if (persistent.length > 0 && totalPairs > 0) {
      const topShare =
        persistent.reduce((sum, [, c]) => sum + c, 0) / totalPairs;
      // Dominant = the persistent files account for >= 50% of all edit
      // activity in the window. Tuned for low false-positive rate.
      if (topShare >= 0.5) {
        return {
          ok: false,
          code: 6,
          reason: "gutter-detected",
          pattern: "file-thrash",
          details: {
            files: persistent.map(([f]) => f),
            window: threshold,
            dominantShare: Number(topShare.toFixed(2)),
          },
        };
      }
    }
  }

  // ── Pattern 3: no-progress ────────────────────────────────────────────────
  // Only runs when caller supplies progressHashHistory. Absence = skip
  // (low-false-positive design — we'd rather miss a stall than flag a
  // healthy run as stalled).
  if (
    state &&
    Array.isArray(state.progressHashHistory) &&
    state.progressHashHistory.length >= window &&
    typeof state.iter === "number"
  ) {
    const history = state.progressHashHistory.slice(-window);
    const first = history[0];
    if (first && history.every((h) => h === first)) {
      return {
        ok: false,
        code: 6,
        reason: "gutter-detected",
        pattern: "no-progress",
        details: {
          unchangedHash: first,
          window,
          iter: state.iter,
        },
      };
    }
  }

  return { ok: true };
}

// ── detectBlockerSentinel ───────────────────────────────────────────────────
//
// Post-worker hook: scans the run.log tail for sentinel strings the worker
// emits when it hits a human-gated blocker (destructive action guard, waiting
// for user input, etc.). A match halts the supervisor with code 6 and the
// matched pattern string so the watch loop can surface it to the user.

const BLOCKER_SENTINEL_PATTERNS = Object.freeze([
  /\bblocked\s+needs\s+human\b/i,
  /\bblocker:\s+.+$/im,
  /\bdestructive\s+action\s+guard\b/i,
  /\bwaiting\s+for\s+user\b/i,
]);

function detectBlockerSentinel(runLogTail) {
  if (typeof runLogTail !== "string" || runLogTail.length === 0) {
    return { ok: true };
  }
  for (const re of BLOCKER_SENTINEL_PATTERNS) {
    const m = runLogTail.match(re);
    if (m) {
      return {
        ok: false,
        code: 6,
        reason: "blocker-sentinel-detected",
        pattern: re.source,
        matchedText: m[0].slice(0, 200),
      };
    }
  }
  return { ok: true };
}

module.exports = {
  DEFAULTS,
  loadConfig,
  saveConfig,
  checkGitBranch,
  checkWorktreeCleanliness,
  checkIterationCap,
  checkWallClockCap,
  validateState,
  detectGutter,
  detectBlockerSentinel,
  // Internal helpers exported for unit tests.
  _globToRegex: globToRegex,
  _matchesAnyGlob: matchesAnyGlob,
  _parsePorcelainLine: parsePorcelainLine,
  _splitIterBlocks: splitIterBlocks,
  _extractErrorSignature: extractErrorSignature,
  _extractEditedFiles: extractEditedFiles,
  _BLOCKER_SENTINEL_PATTERNS: BLOCKER_SENTINEL_PATTERNS,
  _STATUS_ENUM: STATUS_ENUM,
  _PLATFORM_ENUM: PLATFORM_ENUM,
  _REQUIRED_STATE_FIELDS: REQUIRED_STATE_FIELDS,
};
