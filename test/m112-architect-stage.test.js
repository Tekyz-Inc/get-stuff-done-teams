'use strict';

/**
 * M112 — the scan numbered its findings in the order slices happened to finish.
 *
 * hilo-figma-atos, 2026-08-11. A 492-finding register, grouped by severity and
 * ordered by discovery inside each group. Run by hand, an architect pass over
 * the same findings changed the answer:
 *
 *   · The worst defect in the codebase was filed HIGH — account credits that
 *     cover a whole invoice are never marked used, so the same credit is given
 *     away again every month, forever. It sat at position 127.
 *   · A typo in one text box silently routes every real card payment to the
 *     practice gateway, where charges report success and no money moves. MEDIUM.
 *   · Every school's signed legal agreements are downloadable by any other
 *     school. LOW.
 *   · 22 findings were confirmed unreachable code, carried as risk.
 *
 * And the work changed shape: 492 findings collapsed to 28 root causes, with
 * 144 of the 328 medium/low findings attaching to a root that already existed.
 * The codebase does not have 492 problems; it has about 28, most repeated.
 *
 * So the architect became a stage, and it runs BEFORE numbering — otherwise the
 * register's own numbers encode the arrival order.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO = path.join(__dirname, '..');
const SCAN = fs.readFileSync(
  path.join(REPO, 'templates', 'workflows', 'gsd-t-scan.workflow.js'), 'utf8');

test('M112: the architect runs before the findings are ordered or numbered', () => {
  const archCall = SCAN.indexOf('await architectPass(finalFindings)');
  const ordering = SCAN.indexOf('const orderedFindings =');
  assert.ok(archCall > 0, 'the architect must be called');
  assert.ok(ordering > 0, 'the ordering must exist');
  assert.ok(archCall < ordering,
    'ranking after numbering would leave TD-1 meaning "whatever finished first"');
  assert.match(SCAN, /architect-ranks-before-numbering/, 'the rule must be in the guard map');
});

test('M112: EXTREME is a tier the register can express', () => {
  // The architect distinguishes "leaves wrong data behind" from "does not work".
  // Without a place to put it, that judgment is lost on the way to the file.
  assert.match(SCAN, /SEV_ORDER = \{ EXTREME: 0/, 'EXTREME must sort above CRITICAL');
  assert.match(SCAN, /SEV_ORDER2 = \{ EXTREME: 0/, 'and in the ordering used for numbering');
  assert.match(SCAN, /sevHead = \{ EXTREME:/, 'the register needs a section heading for it');
  assert.match(SCAN, /counts\.extreme/, 'and the summary must count it');
});

test('M112: confirmed dead code sinks below live findings', () => {
  // Unreachable code cannot cause a problem, so it must not outrank things that
  // can — that was the owner's own correction.
  assert.match(SCAN, /const deadA = a\.f\._deadCode \? 1 : 0/,
    'dead code must be pushed below everything else in the ordering');
});

test('M112: the dynamic-import trap is carried into the prompt', () => {
  // The manual run nearly demoted a LIVE credit-card form because the code graph
  // showed zero importers — it is loaded by dynamic import, an edge the graph
  // does not carry. Any future pass has to be warned.
  assert.match(SCAN, /AN EMPTY IMPORT LIST DOES NOT PROVE UNREACHABILITY/,
    'the warning must reach the agent, not just this test');
  assert.match(SCAN, /dynamic loading and the router file/,
    'and it must name the checks required before calling anything dead');
});

test('M112: the architect is told severity is comparative', () => {
  // The measured reason batching beat one-agent-per-finding: an agent seeing
  // findings together can rank them; one seeing a single finding confirms it.
  assert.match(SCAN, /HIGHEST-VALUE OUTPUT IS FINDING THE MIS-FILED ONES/,
    'hunting mis-filed findings is the point of the stage');
  assert.match(SCAN, /DOES IT LEAVE WRONG DATA BEHIND, OR DOES IT JUST FAIL TO DO ANYTHING/,
    'the tier discriminator must be stated to the agent');
});

test('M112: an architect that returns nothing is announced, not hidden', () => {
  // A register that looks prioritised and is not is worse than one that never
  // claimed to be.
  assert.match(SCAN, /ARCHITECT PRODUCED NOTHING/,
    'total failure must be said out loud');
  assert.match(SCAN, /It is NOT prioritised; treat its ordering as arbitrary/,
    'and the reader must be told the order means nothing');
  assert.match(SCAN, /keep their filed severity and sit unranked at the end/,
    'a partial result must name what it could not rank');
});

test('M112: the ordering cannot silently lose a finding', () => {
  // A merge in this same family reported full coverage while having dropped two
  // findings. Counted, not assumed.
  assert.match(SCAN, /ORDERING LOST FINDINGS/, 'the count must be checked');
  assert.match(SCAN, /reason: "ordering-lost-findings"/,
    'and losing one must halt rather than write an under-reporting register');
});

test('M112: every finding must be placed exactly once', () => {
  assert.match(SCAN, /must appear exactly once in \\`placements\\`/,
    'the agent must be told a dropped finding is one nobody sees again');
});

test('M112: the architect runs on the top model', () => {
  // Grouping and severity judgment is the highest-stakes reasoning in the scan.
  const fn = SCAN.slice(SCAN.indexOf('async function architectPass'), SCAN.indexOf('const ARCHITECT_SCHEMA'));
  const seg = fn || SCAN;
  assert.match(SCAN, /label: `architect \$\{ci \+ 1\}\/\$\{chunks\.length\}`, phase: "Architect",\s*\n\s*schema: ARCHITECT_SCHEMA, model: "opus"/,
    'the architect stage must run on opus');
});
