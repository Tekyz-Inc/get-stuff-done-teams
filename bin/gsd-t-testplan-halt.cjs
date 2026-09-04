#!/usr/bin/env node
/**
 * gsd-t-testplan-halt — the A5 non-convergence halt.
 *
 * Contract: .gsd-t/contracts/test-plan-first-contract.md §4 (exit codes/envelope/module
 * shape), §5 (verb name), §6 (loop-ledger reuse, READ-ONLY).
 *
 * WHY THIS EXISTS
 * ---------------
 * A test plan's open rows (`GAP` / `GAP:CONTRADICTION` in column 6, §2.1) get closed by
 * asking the human questions. Two ways that loop can go wrong instead of converging:
 *
 *   [RULE] enumeration-loop-cap-three   — three question rounds pass and rows are still
 *     open. Continuing to ask is not the failure mode this catches; FILLING those rows
 *     with something plausible after round three is. So round three HALTS instead.
 *
 *   [RULE] same-symptom-twice-halts     — the same failure signature recurs across two
 *     consecutive rounds. A repeat means the belief behind the last fix was wrong, not
 *     that the fix needs a third attempt — so this halts toward re-examining the belief,
 *     not toward trying again.
 *
 * Both are a HALT, never a fallback: on non-convergence this tool refuses to continue and
 * says so. It never fills an open row and it never silently passes a repeated failure
 * through on a third try.
 *
 * ONE HALT POINT
 * --------------
 * `checkConvergence` runs its steps (read the doc, parse it, ask the loop ledger) without
 * a try/catch of its own — a thrown error from any step propagates untouched. Exactly one
 * try/catch exists, at the CLI entry point (`main`). Its catch ends the process with the
 * same `halt(...)` envelope as every ordinary bad-input path — a stated refusal to
 * continue, never a guessed value, and never a bare stack trace.
 *
 * READ-ONLY REUSE (§6, non-negotiable)
 * -------------------------------------
 * The repeated-signature cap is entirely the loop ledger's (`bin/gsd-t-loop-ledger.cjs`)
 * existing job — `computeSignature` / `appendCycle` / `readExitState`. This file maps an
 * enumeration round onto one ledger cycle and reads the ledger's own verdict; it does not
 * reimplement signature comparison. The ledger is imported, never edited, never forked.
 *
 * Deterministic, zero LLM judgment. Never throws past the CLI boundary — bad input HALTS
 * with exitCode 64.
 *
 * Input:  --doc <path> --round <n> [--milestone <name>]
 *           [--assertion <text> --surface <text> --fileClass <text>]  (repeated-symptom cap;
 *           when omitted, the signature is derived from the doc's own open-row set so the
 *           cap still works from --doc alone)
 *         [--projectDir <path>]
 * Output: JSON envelope { ok, exitCode, doc, round, openRows, halted, haltReason, violations }
 * Exit:   0 clean (not halted) · 4 halted (non-convergence) · 64 bad input — a HALT, not a pass
 *
 * module.exports: { checkConvergence, parseOpenRows, roundToCycleSignature }
 */

"use strict";

const fs = require("fs");
const { walkSections, parseRows, rowState, tableName, REQUIRED_COLUMN_COUNT } = require("./gsd-t-testplan-rows.cjs");
const path = require("path");
const loopLedger = require("./gsd-t-loop-ledger.cjs");

/** [RULE] enumeration-loop-cap-three — this many rounds without closure halts. */
const ROUND_CAP = 3;

/**
 * [RULE] same-symptom-twice-halts — this many consecutive occurrences of the SAME
 * signature halts. Read from the ledger's own `cycles` count on every `appendCycle` call
 * (never from the ledger's own `halted` flag, which fires at ITS fixed internal threshold
 * of 3 — a different cap for a different rule, per the ledger's debug-loop use case). This
 * is still full delegation, not a fork: the ledger computes and persists the signature and
 * the count; this constant only says how many of THIS gate's own occurrences is "twice".
 */
const SYMPTOM_REPEAT_CAP = 2;

/** Column-6 gap markers, matched case-sensitively per contract §2.2. */

// ---------------------------------------------------------------------------
// Row parsing — §2.1 sequence-table schema, read-only interpretation
// ---------------------------------------------------------------------------

/**
 * Parse every sequence table in a test-plan Markdown document and return the rows still
 * `open` (column 6 carries a `GAP` or `GAP:CONTRADICTION` marker).
 *
 * This reads the frozen §2 schema; it does not lint it (that is `testplan-lint`'s job,
 * owned by `deterministic-gates`) — a malformed row is simply not recognised as closed,
 * which is the conservative direction (a row this cannot parse is never silently treated
 * as answered).
 *
 * @param {string} text — the document's raw content
 * @returns {{ table: string, seq: string, reason: string }[]}
 */
function parseOpenRows(text) {
  // Through the ONE shared plan reader and the ONE classifier. Everything that is
  // not a settled answer is OPEN — the halting direction: a gap, a cell that looks
  // like a marker but is not one (`GAPX:`), a row with no Seq (nothing can cite or
  // name it), a row that is not six cells. Red Team M115 run 6: a blank-Seq gap
  // was silently dropped and the round cap never saw it.
  const openRows = [];
  for (const sec of walkSections(text)) {
    const currentTable = tableName(sec.heading);
    if (!currentTable) continue;
    for (const row of parseRows(sec.lines, sec.startLine)) {
      const seq = row.cells[0] && row.cells[0].trim() ? row.cells[0].trim() : "(blank Seq)";
      if (row.width !== REQUIRED_COLUMN_COUNT) {
        openRows.push({ table: currentTable, seq, source: `MALFORMED-ROW (${row.width} cells, expected ${REQUIRED_COLUMN_COUNT})`, line: row.line });
        continue;
      }
      const source = row.cells[5];
      const st = rowState(source);
      if (seq === "(blank Seq)") { openRows.push({ table: currentTable, seq, source: `BLANK-SEQ (${source})`, line: row.line }); continue; }
      if (st === "gap") openRows.push({ table: currentTable, seq, source, line: row.line });
      else if (st === "malformed") openRows.push({ table: currentTable, seq, source: `UNKNOWN-MARKER (${source})`, line: row.line });
      else if (st === "empty") openRows.push({ table: currentTable, seq, source: "BLANK-SOURCE", line: row.line });
    }
  }
  return openRows;
}


// ---------------------------------------------------------------------------
// Round → ledger-cycle mapping (§6, D3-T1) — teaches the ledger what a round is
// ---------------------------------------------------------------------------

/**
 * Build the ledger's `computeSignature` inputs for one enumeration round, running in
 * `--after` mode (i.e. after the round's questions were asked and answered).
 *
 * What identifies a round, by contract: which rows are still open, and what the failing
 * signature is with those rows unresolved. When the caller supplies an explicit
 * assertion/surface/fileClass, that identity is used as given (an explicit input, not a
 * fallback). Only when NONE is supplied does the signature come from the doc's own open-row
 * set: two rounds with the SAME open rows are the same symptom; a round that closed even
 * one row, or opened a different one, is a different symptom — mirroring the ledger's own
 * variant-spawning rule that closing one thing while a new thing opens still does not repeat.
 *
 * @param {{ doc: string, openRows: {table:string, seq:string}[], assertion?: string,
 *           surface?: string, fileClass?: string }} opts
 * @returns {{ assertion: string, surface: string, fileClass: string }}
 */
function roundToCycleSignature({ doc, openRows, assertion, surface, fileClass }) {
  let openRowSignature = "no-open-rows";
  if (openRows.length > 0) {
    const sortedIds = openRows.map((r) => `${r.table}::${r.seq}`).sort();
    openRowSignature = sortedIds.join("|");
  }

  // The ledger keys on assertion + fileClass and DROPS surface on purpose
  // (R-LOOP-1), so two plans with the same open-row set collided on one
  // signature — plan B's first round halted on plan A's history (code-review
  // M115 run 6). The doc is therefore part of the ASSERTION.
  const docKey = path.resolve(String(doc || ""));
  let effectiveAssertion = `${docKey}::${openRowSignature}`;
  if (assertion) effectiveAssertion = `${docKey}::${assertion}`;

  let effectiveSurface = doc;
  if (surface) effectiveSurface = surface;

  let effectiveFileClass = "testplan";
  if (fileClass) effectiveFileClass = fileClass;

  return { assertion: effectiveAssertion, surface: effectiveSurface, fileClass: effectiveFileClass };
}

// ---------------------------------------------------------------------------
// The two caps
// ---------------------------------------------------------------------------

/**
 * Build the exitCode-64 halt envelope for bad/unreadable input. This is the "gate cannot
 * decide" branch of contract §4 — a stated refusal, not a value standing in for a result.
 * Named `halt` (not a generic helper name) so it reads, structurally and at a glance, as
 * the same halt-shape as `deny`/`fail`/`block`/`abort` elsewhere in this codebase.
 */
function halt(reason, extra) {
  const envelope = {
    ok: false,
    exitCode: 64,
    reason,
    openRows: [],
    halted: false,
    haltReason: null,
    violations: [],
  };
  Object.assign(envelope, extra);
  return envelope;
}

/**
 * Run both convergence caps for one round against one test-plan document.
 *
 * Runs no try/catch of its own — see "ONE HALT POINT" above. Any step here that cannot
 * proceed (missing --doc, bad --round, an unreadable doc, a rejecting ledger call) returns
 * an explicit `halt(...)` envelope; nothing here throws on the ordinary bad-input path, so
 * `main`'s single outer catch exists only for a truly unanticipated error.
 *
 * @param {object} opts
 * @param {string} opts.docPath
 * @param {number} opts.round        — 1-indexed round number just completed
 * @param {string} [opts.milestone]
 * @param {string} [opts.assertion]
 * @param {string} [opts.surface]
 * @param {string} [opts.fileClass]
 * @param {string} [opts.projectDir]
 * @returns {{ ok, exitCode, doc, round, openRows, halted, haltReason, violations }}
 */
// Per-project record of which round last fed each signature to the ledger.
// Read fail-closed: corrupt → null (the caller HALTS), never an empty object.
function roundsRecordPath(projectDir) {
  return path.join(path.resolve(projectDir || "."), ".gsd-t", "testplan-halt-rounds.json");
}
function readRoundsRecord(projectDir) {
  const p = roundsRecordPath(projectDir);
  if (!fs.existsSync(p)) return {};
  let parsed;
  try { parsed = JSON.parse(fs.readFileSync(p, "utf8")); } catch (_e) { return null; }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  return parsed;
}
function writeRoundsRecord(projectDir, record) {
  const p = roundsRecordPath(projectDir);
  try {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    const tmp = `${p}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(record, null, 2) + "\n");
    fs.renameSync(tmp, p);
    return true;
  } catch (e) { return e && e.message ? e.message : String(e); }
}

function checkConvergence(opts) {
  const o = opts || {};
  const docPath = o.docPath;
  const round = o.round;
  const milestone = o.milestone;
  const assertion = o.assertion;
  const surface = o.surface;
  const fileClass = o.fileClass;
  const projectDir = o.projectDir;

  const docPathIsGiven = !!docPath && typeof docPath === "string";
  if (!docPathIsGiven) {
    return halt("--doc is required", { doc: docPath, round: round });
  }

  // A valueless `--round` arrives as boolean true and Number(true) is 1, which
  // would pass a numeric check and defeat the three-round cap (code-review M115,
  // important). Only a digit string (or an actual integer from a module caller)
  // counts.
  const roundStr = typeof round === "number" ? String(round) : round;
  const roundIsPositiveInteger = typeof roundStr === "string" && /^[1-9][0-9]*$/.test(roundStr);
  const roundNum = roundIsPositiveInteger ? Number(roundStr) : NaN;
  if (!roundIsPositiveInteger) {
    return halt("--round must be a positive integer", { doc: docPath, round: round });
  }

  const docExists = fs.existsSync(docPath);
  if (!docExists) {
    return halt(`cannot read doc: no such file: ${docPath}`, { doc: docPath, round: roundNum });
  }
  const stat = fs.statSync(docPath);
  const docIsFile = stat.isFile();
  if (!docIsFile) {
    return halt(`cannot read doc: not a file: ${docPath}`, { doc: docPath, round: roundNum });
  }

  const text = fs.readFileSync(docPath, "utf8");
  const openRows = parseOpenRows(text);

  // --- Cap 1: enumeration-loop-cap-three -----------------------------------
  const roundCapFired = roundNum >= ROUND_CAP && openRows.length > 0;
  if (roundCapFired) {
    const namedOpenRows = openRows
      .map((r) => `${r.table} Seq ${r.seq} (${r.source})`)
      .join("; ");
    return {
      ok: false,
      exitCode: 4,
      doc: docPath,
      round: roundNum,
      openRows: openRows,
      halted: true,
      haltReason:
        `enumeration-loop-cap-three: ${roundNum} question rounds have passed and ` +
        `${openRows.length} row(s) are still open. HALT — blocked-needs-human. ` +
        `Still-open: ${namedOpenRows}`,
      violations: openRows.map((r) => ({
        kind: "enumeration-loop-cap-three",
        detail: `${r.table} Seq ${r.seq}: ${r.source}`,
      })),
    };
  }

  // --- Cap 2: same-symptom-twice-halts (delegates to the loop ledger) ------
  // Gated on open rows remaining: a "failure signature" presumes a failure. A round
  // that closed everything has nothing to repeat, so it is not fed to the ledger at
  // all — neither to check a repeat nor to accumulate a cycle count. This is what lets
  // a converged plan pass through untouched no matter how many times it is re-checked.
  const roundHasOpenRows = openRows.length > 0;
  if (roundHasOpenRows) {
    const sig = roundToCycleSignature({ doc: docPath, openRows: openRows, assertion: assertion, surface: surface, fileClass: fileClass });
    // The ledger counts CALLS. A re-check of the same round is not a new round
    // (code-review M115 run 6: re-running round 2 fired the repeat cap). This
    // tool keeps its own record of which round last fed each signature; a
    // repeat of that round re-uses the recorded count instead of appending.
    const roundsRecord = readRoundsRecord(projectDir);
    if (roundsRecord === null) {
      return halt("testplan-halt rounds record is corrupt — fix or remove .gsd-t/testplan-halt-rounds.json (a silent reset would hide a loop)", { doc: docPath, round: roundNum });
    }
    const sigKey = `${sig.assertion}\u0000${sig.fileClass}`;
    const prior = roundsRecord[sigKey];
    let ledgerResult;
    if (prior && prior.lastRound === roundNum) {
      ledgerResult = { ok: true, cycles: prior.cycles, signature: prior.signature };
    } else {
      const ledgerCallOpts = { assertion: sig.assertion, surface: sig.surface, fileClass: sig.fileClass, projectDir: projectDir, milestone: milestone };
      ledgerResult = loopLedger.appendCycle(ledgerCallOpts);
      const ledgerAccepted = !!ledgerResult && ledgerResult.ok === true;
      if (!ledgerAccepted) {
        let ledgerError = "unknown error";
        if (ledgerResult && ledgerResult.error) ledgerError = ledgerResult.error;
        return halt(`loop-ledger rejected the cycle: ${ledgerError}`, { doc: docPath, round: roundNum });
      }
      roundsRecord[sigKey] = { lastRound: roundNum, cycles: ledgerResult.cycles, signature: ledgerResult.signature };
      const written = writeRoundsRecord(projectDir, roundsRecord);
      if (written !== true) return halt(`could not write the rounds record: ${written}`, { doc: docPath, round: roundNum });
    }

    const symptomRepeated = ledgerResult.cycles >= SYMPTOM_REPEAT_CAP;
    if (symptomRepeated) {
      return {
        ok: false,
        exitCode: 4,
        doc: docPath,
        round: roundNum,
        openRows: openRows,
        halted: true,
        haltReason:
          `same-symptom-twice-halts: the same failure signature has appeared ` +
          `${ledgerResult.cycles} times running. The belief behind the fix is wrong, not the ` +
          `fix insufficient — re-examine the premise, do not attempt a third fix. ` +
          `signature=${ledgerResult.signature}`,
        violations: [
          {
            kind: "same-symptom-twice-halts",
            detail: `signature ${ledgerResult.signature} repeated ${ledgerResult.cycles} times`,
          },
        ],
      };
    }
  }

  // --- Converged for this round: neither cap fired -------------------------
  return {
    ok: true,
    exitCode: 0,
    doc: docPath,
    round: roundNum,
    openRows: openRows,
    halted: false,
    haltReason: null,
    violations: [],
  };
}

// ---------------------------------------------------------------------------
// module.exports (§4 module shape — testable before front-door-wiring registers it)
// ---------------------------------------------------------------------------

module.exports = { checkConvergence, parseOpenRows, roundToCycleSignature };

// ---------------------------------------------------------------------------
// CLI entry point — `node bin/gsd-t-testplan-halt.cjs check ...`
// ---------------------------------------------------------------------------

function parseFlags(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      const hasValue = next !== undefined && !next.startsWith("--");
      if (hasValue) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    }
  }
  return flags;
}

function dispatch(argv) {
  const subcommand = argv[0];
  const rest = argv.slice(1);
  const isCheck = subcommand === "check";
  if (!isCheck) {
    let reason = "Subcommand required: check";
    if (subcommand) reason = `Unknown subcommand: ${subcommand}. Valid: check`;
    return { ok: false, exitCode: 64, reason: reason, violations: [] };
  }
  const flags = parseFlags(rest);
  let projectDir = process.cwd();
  if (flags.projectDir) projectDir = flags.projectDir;
  return checkConvergence({
    docPath: flags.doc,
    round: flags.round,
    milestone: flags.milestone,
    assertion: flags.assertion,
    surface: flags.surface,
    fileClass: flags.fileClass,
    projectDir: projectDir,
  });
}

/** Write the one JSON envelope and stop the process with its exit code. */
function emitAndExit(res) {
  process.stdout.write(JSON.stringify(res) + "\n");
  process.exit(res.exitCode);
}

/**
 * The single halt point for this file (see "ONE HALT POINT" above). One try/catch; the
 * catch itself ends the process with the same `halt(...)` envelope shape — never lets an
 * escaped error surface as a bare stack trace.
 */
function main() {
  try {
    emitAndExit(dispatch(process.argv.slice(2)));
  } catch (e) {
    emitAndExit(halt(`gate-error: ${e && e.message}`, {}));
  }
}

if (require.main === module) main();
