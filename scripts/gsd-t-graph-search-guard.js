#!/usr/bin/env node
/**
 * gsd-t-graph-search-guard.js
 *
 * M117 - PreToolUse hook on Bash and Grep. Blocks a search that asks a
 * structural question about code, and names the graph command that answers it.
 *
 * [RULE] search-guard-blocks-structural-code-search
 * [RULE] search-guard-unclear-blocks-never-allows
 * [RULE] search-guard-missing-graph-blocks-never-degrades
 *
 * WHY THIS EXISTS
 *   The graph rule already said "query the graph, do not grep around it", and
 *   two hooks already enforced it - on the Grep tool and the Read tool. Neither
 *   ever fired in real work. In bypass-permissions mode the standing house rule
 *   is to work through Bash, so every structural search went out as `grep` in a
 *   Bash call and sailed past both hooks. The ledger records the result: two
 *   grep events in three months, both from June test probes, against 34,418
 *   graph queries all from the graph's own tooling. The rule had no trigger on
 *   the path actually taken.
 *
 * THE THREE OUTCOMES (there is no fourth, and none of them continues past a
 * failure):
 *   structural  BLOCK. Print the graph command to run instead.
 *   content     ALLOW. Markdown, JSON, SQL, config, prose - the graph does not
 *               index them, so it has no answer to route to. Not a bypass.
 *   unclear     BLOCK. The classifier could not read the intent, and guessing
 *               "probably text" is the guess that keeps the rule toothless.
 *
 * A MISSING OR BROKEN GRAPH ALSO BLOCKS. Allowing the grep because the graph is
 * unavailable is the exact fallback that hid the binvoice failure - a project
 * grepping its way through 827 files while the graph sat unbuilt. The answer is
 * `gsd-t graph index`, which the block message says.
 *
 * WHAT IT CANNOT SEE, STATED PLAINLY: it governs tool calls, not reasoning.
 * Reading a file end to end to work out who calls something leaves no pattern
 * for any guard to match. The Stop-time check (gsd-t-graph-use-report.js) is
 * what covers that, by comparing structural work against graph queries issued.
 *
 * --- Stdin (Claude Code PreToolUse payload) --------------------------------
 *   { "tool_name": "Bash"|"Grep", "cwd": "...",
 *     "tool_input": { "command": "..." } | { "pattern": "...", "glob": "..." } }
 *
 * --- Decision contract -----------------------------------------------------
 *   Deny:  {"hookSpecificOutput":{"hookEventName":"PreToolUse",
 *           "permissionDecision":"deny","permissionDecisionReason":"..."}}
 *   Allow: exit 0, no output.
 *
 * Zero dependencies.
 */

"use strict";

const fs = require("fs");
const path = require("path");

function deny(reason) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: reason,
    },
  }) + "\n");
  process.exit(0);
}

function allow() { process.exit(0); }

/**
 * Locate the classifier. A project without one has an incomplete install, and
 * the repair is `gsd-t install-check` - not a hunt for a copy elsewhere, and
 * not silently letting every search through.
 */
function findClassifier(projectDir) {
  const inProject = path.join(projectDir, "bin", "gsd-t-code-search-classifier.cjs");
  if (fs.existsSync(inProject)) return inProject;

  const inPackage = path.join(__dirname, "..", "bin", "gsd-t-code-search-classifier.cjs");
  if (fs.existsSync(inPackage)) return inPackage;

  throw new Error(
    "This project has no copy of the search classifier at " + inProject + ", which " +
    "means its GSD-T install is incomplete. Run 'gsd-t install-check' to repair it."
  );
}

/** Thrown when the settings file exists but cannot be understood. */
class ConfigUnreadable extends Error {}

/**
 * Is the guard switched on for this project?
 * An unreadable settings file throws - assuming "on" or "off" would be a guess
 * about what the project wanted. Only an ABSENT file means on, because absence
 * is unambiguous.
 */
function isEnabled(projectDir) {
  const p = path.join(projectDir, ".gsd-t", "graph-search-gate.json");
  if (!fs.existsSync(p)) return true;
  let raw;
  try {
    raw = fs.readFileSync(p, "utf8");
  } catch (e) {
    throw new ConfigUnreadable(p + " could not be read: " + e.message);
  }
  const cfg = JSON.parse(raw);
  return cfg.enabled !== false;
}

// --- Command parsing -------------------------------------------------------
//
// Split a shell command into its pipeline stages, then look at each stage that
// runs a search program. A structural search buried in the middle of a pipe is
// still a structural search.

const SEARCH_PROGRAMS = new Set(["grep", "egrep", "fgrep", "rg", "ripgrep", "ag", "ack", "find", "ugrep"]);

// Flags that take a value in the NEXT argument, so that value is not the pattern.
const FLAGS_TAKING_VALUE = new Set([
  "-e", "--regexp", "-f", "--file", "--include", "--exclude", "--glob", "-g",
  "-m", "--max-count", "-A", "-B", "-C", "--after-context", "--before-context",
  "--context", "-d", "--directories", "--color", "--colour", "-t", "--type",
  "-name", "-iname", "-path", "-type", "-maxdepth", "-mindepth",
]);

/**
 * Break a command line into tokens, keeping quoted runs together and dropping
 * the quotes. Good enough for reading a search invocation; it is not a shell.
 */
function tokenize(command) {
  const tokens = [];
  let cur = "";
  let quote = null;
  let started = false;

  for (let i = 0; i < command.length; i++) {
    const ch = command[i];

    if (quote) {
      if (ch === quote) { quote = null; continue; }
      cur += ch;
      started = true;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; started = true; continue; }
    if (ch === "\\" && i + 1 < command.length) { cur += command[i + 1]; started = true; i++; continue; }
    if (/\s/.test(ch)) {
      if (started) { tokens.push(cur); cur = ""; started = false; }
      continue;
    }
    cur += ch;
    started = true;
  }
  if (started) tokens.push(cur);
  return tokens;
}

/** Split a token list on shell stage separators. */
function pipelineStages(tokens) {
  const SEPARATORS = new Set(["|", "||", "&&", ";", "&"]);
  const stages = [];
  let cur = [];
  for (const t of tokens) {
    if (SEPARATORS.has(t)) {
      if (cur.length) stages.push(cur);
      cur = [];
      continue;
    }
    cur.push(t);
  }
  if (cur.length) stages.push(cur);
  return stages;
}


// --- Where the pattern sits, one reader per spelling -----------------------

function hasExplicitRegexpFlag(argv) {
  for (const a of argv) {
    if (a === "-e") return true;
    if (a === "--regexp") return true;
  }
  return false;
}

function patternFromRegexpFlag(argv) {
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "-e" || argv[i] === "--regexp") return argv[i + 1];
  }
  return null;
}

function patternFromNameFlag(argv) {
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "-name" || argv[i] === "-iname") return argv[i + 1];
  }
  return null;
}

function firstPositional(argv) {
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (FLAGS_TAKING_VALUE.has(a)) { i++; continue; }
    if (a.startsWith("-")) continue;
    return a;
  }
  return null;
}

/**
 * From one pipeline stage, work out the search program and its pattern.
 * Returns null when the stage runs no search program.
 */
function readSearchStage(stage) {
  let idx = 0;

  // Step past environment assignments and common prefixes.
  while (idx < stage.length) {
    const t = stage[idx];
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(t)) { idx++; continue; }
    if (t === "sudo" || t === "command" || t === "time" || t === "xargs") { idx++; continue; }
    break;
  }
  if (idx >= stage.length) return null;

  const program = path.basename(stage[idx]);
  if (!SEARCH_PROGRAMS.has(program)) return null;

  const argv = stage.slice(idx + 1);

  // Where the pattern sits depends only on how the command was spelled. These
  // are three SPELLINGS of the same argument, not three attempts with earlier
  // ones falling back to later ones: `find` always carries it after -name,
  // grep-family tools carry it after -e when that flag is used and positionally
  // otherwise. Which reader applies is decided up front, from the command
  // itself, so nothing here substitutes for a value that went missing.
  const pattern = program === "find"
    ? patternFromNameFlag(argv)
    : (hasExplicitRegexpFlag(argv) ? patternFromRegexpFlag(argv) : firstPositional(argv));

  // A search program was invoked but no pattern could be read out of it. That
  // is NOT "no search here" - it is a search this guard could not inspect, and
  // reporting null would let it run unexamined. It is returned as unreadable so
  // the caller blocks and says so.
  if (typeof pattern !== "string") {
    return { program, pattern: null, argv, unreadable: true };
  }
  return { program, pattern, argv, unreadable: false };
}

// --- Graph availability ----------------------------------------------------
//
// A structural question needs a graph to answer it. No graph is a BLOCK with
// "build it", never a quiet permission to grep instead.

function graphStorePath(projectDir) {
  const candidates = [
    path.join(projectDir, ".gsd-t", "graphDB", "graph.db"),
    path.join(projectDir, ".gsd-t", "graph.db"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

function buildNoGraphReason(found, cls) {
  return [
    "This is a structural question about code, and this project has no code graph built.",
    "",
    "  searching for: " + found.pattern,
    "  which is:      " + cls.reason,
    "",
    "Build the graph, then ask it:",
    "",
    "  gsd-t graph index",
    "",
    "Grepping instead would answer a question about relationships by matching text,",
    "which is a different and wrong answer. A missing graph is a repairable condition,",
    "not a reason to fall back to grep.",
  ].join("\n");
}

function buildStructuralReason(found, cls) {
  const lines = [];

  const symbol = cls.symbol === null ? found.pattern : cls.symbol;
  const verb = cls.verb === null ? "who-calls" : cls.verb;

  lines.push(
    "This is a structural question about code. The graph answers it; grep only matches text.",
    "",
    "  searching for: " + found.pattern,
    "  which is:      " + cls.reason,
    "",
    "Ask the graph instead:",
    "",
    "  gsd-t graph " + verb + " " + symbol,
    "",
    "Other verbs: who-imports, who-calls, defines, blast-radius, body.",
    "",
    "If this really is a text search - a phrase in prose, a key in config, a string in a",
    "document - scope it to the files the graph does not index, and it will run:",
    "",
    "  grep --include='*.md' --include='*.json' ..."
  );
  return lines.join("\n");
}

function buildUnclearReason(found, cls) {
  return [
    "This search could be asking about code structure, and that has to be settled before",
    "it runs - a guess in either direction is how the graph rule stopped having teeth.",
    "",
    "  searching for: " + found.pattern,
    "  why unclear:   " + cls.reason,
    "",
    "Say which it is:",
    "",
    "  Structure (who calls, who imports, where defined):",
    "    gsd-t graph who-calls <symbol>",
    "",
    "  Text in files the graph does not index (.md, .json, .sql, config, prose):",
    "    add --include='*.md' (or the right extensions) and run it again",
  ].join("\n");
}


// --- Recording the decision ------------------------------------------------
//
// One line per block, into the same ledger the graph's own tooling writes. The
// Stop-time report reads these to spot a turn that hit structural questions and
// never asked the graph. Writing it must never change the decision, so a sink
// failure is swallowed here and nowhere else in this file.

function recordBlock(projectDir, program, pattern, verdict) {
  try {
    const dir = path.join(projectDir, ".gsd-t", "graphDB", "logs");
    if (!fs.existsSync(dir)) return;
    let names = fs.readdirSync(dir)
      .filter((n) => n.startsWith("graph-events-") && n.endsWith(".jsonl"));
    if (names.length === 0) return;
    names.sort();
    const file = path.join(dir, names[names.length - 1]);
    const line = JSON.stringify({
      kind: "search-blocked",
      ts: new Date().toISOString(),
      program,
      verdict,
      patternShape: String(pattern).slice(0, 120),
      consumer: "search-guard",
    });
    fs.appendFileSync(file, line + "\n");
  } catch (e) {
    // The block still happens - the decision is made above and does not depend
    // on this record. But the failure is SAID, not swallowed: the Stop-time
    // report reads these lines, so a ledger that silently stopped accepting
    // them would make that report quietly under-count and look clean.
    // stderr, because stdout carries the permission decision.
    process.stderr.write(
      "[GSD-T GRAPH] the search-block record could not be written (" + e.message + "). " +
      "The search was still blocked; the Stop-time graph-use report will under-count.\n"
    );
  }
}

function main() {
  let input = "";
  let done = false;

  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (c) => { input += c; });
  process.stdin.on("end", () => {
    if (done) return;
    done = true;
    decide(input);
  });

  // A payload that never arrives is not a search to judge. Exiting 0 here is
  // "nothing was asked", not "a failure was ignored".
  setTimeout(() => {
    if (done) return;
    done = true;
    decide(input);
  }, 4000);
}

function decide(raw) {
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    // No readable payload means no search to classify. Not applicable.
    allow();
    return;
  }

  const toolName = payload.tool_name;
  if (toolName !== "Bash" && toolName !== "Grep") { allow(); return; }

  const projectDir = typeof payload.cwd === "string" ? payload.cwd : process.cwd();

  // Not a GSD-T project - this rule is GSD-T's, so it does not apply.
  if (!fs.existsSync(path.join(projectDir, ".gsd-t"))) { allow(); return; }

  let enabled;
  try {
    enabled = isEnabled(projectDir);
  } catch (e) {
    deny(
      "The graph-search gate's settings could not be read, so it cannot be known whether " +
      "this search is allowed: " + e.message + "\n\n" +
      "Fix or delete .gsd-t/graph-search-gate.json."
    );
    return;
  }
  if (!enabled) { allow(); return; }

  let classifySearch;
  try {
    const mod = require(findClassifier(projectDir));
    classifySearch = mod.classifySearch;
  } catch (e) {
    deny("The graph-search gate could not load its classifier: " + e.message);
    return;
  }

  // Gather the search stages this call would run.
  const found = [];
  if (toolName === "Grep") {
    const gi = payload.tool_input;
    if (!gi) { allow(); return; }
    const argv = [];
    if (typeof gi.glob === "string") { argv.push("--glob", gi.glob); }
    if (typeof gi.path === "string") { argv.push(gi.path); }
    if (typeof gi.type === "string") { argv.push("-t" + gi.type); }
    if (typeof gi.pattern !== "string") { allow(); return; }
    found.push({ program: "rg", pattern: gi.pattern, argv });
  } else {
    const command = payload.tool_input === undefined ? undefined : payload.tool_input.command;
    if (typeof command !== "string") { allow(); return; }
    for (const stage of pipelineStages(tokenize(command))) {
      const s = readSearchStage(stage);
      if (s !== null) found.push(s);
    }
  }

  if (found.length === 0) { allow(); return; }

  const hasGraph = graphStorePath(projectDir) !== null;

  for (const f of found) {
    // A search whose pattern could not be read is a search that cannot be
    // judged. It blocks: letting it through would be deciding it is safe on
    // the strength of evidence that could not be gathered.
    if (f.unreadable === true) {
      deny(
        "A " + f.program + " search was invoked but this guard could not read what it " +
        "searches for, so it cannot tell whether the code graph should answer it instead.\n\n" +
        "Rewrite it so the pattern is a plain argument (or use -e <pattern>), or ask the " +
        "graph directly:\n\n  gsd-t graph who-calls <symbol>"
      );
      return;
    }

    let cls;
    try {
      cls = classifySearch({ pattern: f.pattern, argv: f.argv, program: f.program });
    } catch (e) {
      deny("The graph-search gate could not classify this search: " + e.message);
      return;
    }

    if (cls.verdict === "structural") {
      recordBlock(projectDir, f.program, f.pattern, "structural");
      if (hasGraph) deny(buildStructuralReason(f, cls));
      else deny(buildNoGraphReason(f, cls));
      return;
    }
    if (cls.verdict === "unclear") {
      recordBlock(projectDir, f.program, f.pattern, "unclear");
      deny(buildUnclearReason(f, cls));
      return;
    }
  }

  allow();
}

main();
