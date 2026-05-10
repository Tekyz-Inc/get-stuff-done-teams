'use strict';
/**
 * M56 D2 — Upper-stage brief kinds tests
 *
 * Verifies the 5 new context-brief kinds (partition, plan, discuss, impact,
 * milestone) load cleanly, register in KINDS, produce valid envelopes,
 * and stay under the MAX_BRIEF_BYTES cap.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const cb = require('../bin/gsd-t-context-brief.cjs');
const partitionKind = require('../bin/gsd-t-context-brief-kinds/partition.cjs');
const planKind = require('../bin/gsd-t-context-brief-kinds/plan.cjs');
const discussKind = require('../bin/gsd-t-context-brief-kinds/discuss.cjs');
const impactKind = require('../bin/gsd-t-context-brief-kinds/impact.cjs');
const milestoneKind = require('../bin/gsd-t-context-brief-kinds/milestone.cjs');

const NEW_KINDS = ['partition', 'plan', 'discuss', 'impact', 'milestone'];

test('KINDS registry includes all 5 new M56 D2 kinds', () => {
  // The KINDS const drives the validation set in generateBrief.
  // Re-import-and-grep avoids depending on an internal export.
  const src = fs.readFileSync(path.join(__dirname, '..', 'bin', 'gsd-t-context-brief.cjs'), 'utf8');
  for (const k of NEW_KINDS) {
    assert.ok(src.includes(`'${k}'`), `KINDS should include '${k}'`);
  }
});

test.each = function (cases, fn) {
  // tiny helper since node:test doesn't ship test.each natively
  for (const c of cases) {
    test(c.name, () => fn(c));
  }
};

for (const kindName of NEW_KINDS) {
  test(`${kindName}: kind module exports name + collect + valid shape`, () => {
    const mod = require(`../bin/gsd-t-context-brief-kinds/${kindName}.cjs`);
    assert.strictEqual(mod.name, kindName, `${kindName} module name should match filename stem`);
    assert.strictEqual(typeof mod.collect, 'function', `${kindName} module should export a collect function`);
  });
}

function makeProjectFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'm56-d2-'));
  fs.mkdirSync(path.join(dir, '.gsd-t', 'domains', 'm99-d1-test'), { recursive: true });
  fs.mkdirSync(path.join(dir, '.gsd-t', 'contracts'), { recursive: true });
  fs.mkdirSync(path.join(dir, '.gsd-t', 'briefs'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.gsd-t', 'progress.md'),
    `# GSD-T Progress\n\n## Project: Test\n## Status: ACTIVE\n## Date: 2026-05-09\n## Version: 1.2.34\n\n## Milestones\n\n| # | Milestone | Status | Version | Domains |\n|---|-----------|--------|---------|---------|\n| M99 | Test Milestone | DEFINED | TBD | 1 domain |\n| M55 | Prior | COMPLETE | 1.2.30 | done |\n\n## Decision Log\n\n- 2026-05-09 19:30: [defined] M99 — test milestone for D2 fixtures.\n- 2026-05-09 19:31: [partitioned] M99 — single domain.\n- 2026-05-09 19:32: [planned] M99 — task list authored.\n`);
  fs.writeFileSync(path.join(dir, '.gsd-t', 'domains', 'm99-d1-test', 'scope.md'),
    `# Domain: m99-d1-test\n\n## Responsibility\nTest domain for D2 brief-kind unit tests.\n\n## Files Owned\n- \`bin/test.cjs\` — test module\n- \`test/test.test.js\` — test file\n`);
  fs.writeFileSync(path.join(dir, 'CLAUDE.md'),
    `# Test Project\n\nThis is a test project for M56 D2 brief-kind unit tests.\nThe project uses Node.js and follows the GSD-T conventions.\n`);
  return dir;
}

for (const kindName of NEW_KINDS) {
  test(`${kindName}: produces envelope with schemaVersion + kind`, () => {
    const dir = makeProjectFixture();
    const brief = cb.generateBrief({
      kind: kindName,
      projectDir: dir,
      domain: 'm99-d1-test',
      spawnId: `${kindName}-test-1`,
    });
    assert.ok(brief, `${kindName}: generateBrief should return an object`);
    assert.strictEqual(brief.schemaVersion, '1.0.0', `${kindName}: schemaVersion should be 1.0.0`);
    assert.strictEqual(brief.kind, kindName, `${kindName}: kind field should match`);
    assert.ok(brief.scope, `${kindName}: brief should have a scope field`);
    assert.ok(brief.ancillary, `${kindName}: brief should have an ancillary field`);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test(`${kindName}: brief stays under MAX_BRIEF_BYTES (10 KB)`, () => {
    const dir = makeProjectFixture();
    const brief = cb.generateBrief({
      kind: kindName,
      projectDir: dir,
      domain: 'm99-d1-test',
      spawnId: `${kindName}-cap`,
    });
    const bytes = Buffer.byteLength(JSON.stringify(brief), 'utf8');
    assert.ok(bytes < 10240, `${kindName}: brief should be under 10 KB (got ${bytes})`);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test(`${kindName}: missing-input resilience (no progress.md, no domain dir)`, () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'm56-d2-empty-'));
    let threw = false;
    let brief;
    try {
      brief = cb.generateBrief({
        kind: kindName,
        projectDir: dir,
        spawnId: `${kindName}-empty`,
      });
    } catch (e) {
      threw = true;
    }
    assert.strictEqual(threw, false, `${kindName}: should not throw on missing input — fail-open contract`);
    if (!threw) {
      assert.ok(brief, `${kindName}: should return a brief object`);
      assert.strictEqual(brief.kind, kindName);
    }
    fs.rmSync(dir, { recursive: true, force: true });
  });
}

test('partition: surfaces current milestone row + existing domains list', () => {
  const dir = makeProjectFixture();
  const brief = cb.generateBrief({
    kind: 'partition',
    projectDir: dir,
    spawnId: 'partition-extract',
  });
  assert.ok(brief.ancillary, 'should have ancillary section');
  assert.ok(brief.ancillary.currentMilestoneRow, 'should surface current milestone row');
  assert.ok(brief.ancillary.currentMilestoneRow.includes('M99'), 'milestone row should mention M99');
  assert.ok(Array.isArray(brief.ancillary.existingDomains), 'existingDomains should be an array');
  assert.ok(brief.ancillary.existingDomains.includes('m99-d1-test'), 'should list m99-d1-test');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('milestone: surfaces last completed milestone row + version + decision log entries', () => {
  const dir = makeProjectFixture();
  const brief = cb.generateBrief({
    kind: 'milestone',
    projectDir: dir,
    spawnId: 'milestone-extract',
  });
  assert.ok(brief.ancillary.lastCompletedMilestoneRow, 'should surface last COMPLETE milestone');
  assert.ok(brief.ancillary.lastCompletedMilestoneRow.includes('M55'), 'should be M55');
  assert.strictEqual(brief.ancillary.currentVersion, '1.2.34', 'should extract current version');
  assert.ok(Array.isArray(brief.ancillary.lastDecisionLogEntries), 'decision log entries should be an array');
  assert.ok(brief.ancillary.lastDecisionLogEntries.length > 0, 'should have at least one entry');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('plan: surfaces partitioned-domain summaries with files-owned bullets', () => {
  const dir = makeProjectFixture();
  const brief = cb.generateBrief({
    kind: 'plan',
    projectDir: dir,
    spawnId: 'plan-extract',
  });
  assert.ok(Array.isArray(brief.ancillary.partitionedDomains), 'partitionedDomains should be an array');
  assert.strictEqual(brief.ancillary.milestonePrefix, 'm99', 'milestonePrefix should be m99');
  assert.ok(brief.ancillary.partitionedDomains.length >= 1, 'should find at least one domain');
  const dom = brief.ancillary.partitionedDomains.find((d) => d.domain === 'm99-d1-test');
  assert.ok(dom, 'should find m99-d1-test');
  assert.ok(dom.filesOwnedFirst3.includes('bin/test.cjs'), 'should extract bin/test.cjs from files-owned');
});
