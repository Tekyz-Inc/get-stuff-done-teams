/**
 * M110 — CLAUDE.md changelog tracking tests
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const CLI = path.join(__dirname, '..', 'bin', 'gsd-t-claude-md-changelog.cjs');
const TEST_DIR = path.join(__dirname, 'fixtures', 'm110-changelog');

function run(args) {
  try {
    const result = execSync(`node "${CLI}" ${args}`, { encoding: 'utf8', cwd: TEST_DIR });
    return { stdout: result, exitCode: 0 };
  } catch (e) {
    return { stdout: e.stdout || '', stderr: e.stderr || '', exitCode: e.status };
  }
}

describe('M110: CLAUDE.md changelog', () => {
  before(() => {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
    fs.mkdirSync(TEST_DIR, { recursive: true });
  });

  after(() => {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  });

  describe('scaffold', () => {
    it('creates changelog file if missing', () => {
      const result = run('scaffold .');
      assert.strictEqual(result.exitCode, 0);
      const parsed = JSON.parse(result.stdout);
      assert.strictEqual(parsed.status, 'created');
      assert.ok(fs.existsSync(path.join(TEST_DIR, 'CLAUDE.md updates.md')));
    });

    it('reports exists if already present', () => {
      const result = run('scaffold .');
      assert.strictEqual(result.exitCode, 0);
      const parsed = JSON.parse(result.stdout);
      assert.strictEqual(parsed.status, 'exists');
    });
  });

  describe('append', () => {
    it('appends rewritten entry', () => {
      const result = run('append . rewritten "Test rewrite description"');
      assert.strictEqual(result.exitCode, 0);
      const parsed = JSON.parse(result.stdout);
      assert.strictEqual(parsed.type, 'Rewritten');

      const content = fs.readFileSync(path.join(TEST_DIR, 'CLAUDE.md updates.md'), 'utf8');
      assert.ok(content.includes('**Rewritten'));
      assert.ok(content.includes('Test rewrite description'));
    });

    it('appends updated entry with bullets', () => {
      const result = run('append . updated "" \'["First change", "Second change"]\'');
      assert.strictEqual(result.exitCode, 0);
      const parsed = JSON.parse(result.stdout);
      assert.strictEqual(parsed.type, 'Updated');

      const content = fs.readFileSync(path.join(TEST_DIR, 'CLAUDE.md updates.md'), 'utf8');
      assert.ok(content.includes('**Updated'));
      assert.ok(content.includes('- First change'));
      assert.ok(content.includes('- Second change'));
    });

    it('appends external entry', () => {
      const result = run('append . external');
      assert.strictEqual(result.exitCode, 0);
      const parsed = JSON.parse(result.stdout);
      assert.strictEqual(parsed.type, 'External update detected');
    });
  });

  describe('check-external', () => {
    it('returns no-claude-md when CLAUDE.md is missing', () => {
      const result = run('check-external .');
      assert.strictEqual(result.exitCode, 0);
      const parsed = JSON.parse(result.stdout);
      assert.strictEqual(parsed.status, 'no-claude-md');
    });

    it('returns external-detected when CLAUDE.md exists but no changelog entries', () => {
      // Create CLAUDE.md
      fs.writeFileSync(path.join(TEST_DIR, 'CLAUDE.md'), '# Test');
      // Remove old changelog and create empty one
      fs.rmSync(path.join(TEST_DIR, 'CLAUDE.md updates.md'), { force: true });
      run('scaffold .');

      const result = run('check-external .');
      assert.strictEqual(result.exitCode, 1);
      const parsed = JSON.parse(result.stdout);
      assert.strictEqual(parsed.status, 'external-detected');
      assert.strictEqual(parsed.reason, 'no-prior-entries');
    });

    it('returns up-to-date when changelog is current', () => {
      // Add an entry
      run('append . rewritten "Initial"');

      // Touch CLAUDE.md to be OLDER than the entry
      const past = new Date(Date.now() - 120000); // 2 minutes ago
      fs.utimesSync(path.join(TEST_DIR, 'CLAUDE.md'), past, past);

      const result = run('check-external .');
      assert.strictEqual(result.exitCode, 0);
      const parsed = JSON.parse(result.stdout);
      assert.strictEqual(parsed.status, 'up-to-date');
    });

    it('returns external-detected when CLAUDE.md is newer', () => {
      // Touch CLAUDE.md to be NEWER than the last entry
      const future = new Date(Date.now() + 120000); // 2 minutes in future
      fs.utimesSync(path.join(TEST_DIR, 'CLAUDE.md'), future, future);

      const result = run('check-external .');
      assert.strictEqual(result.exitCode, 1);
      const parsed = JSON.parse(result.stdout);
      assert.strictEqual(parsed.status, 'external-detected');
      assert.strictEqual(parsed.reason, 'mtime-newer');
    });
  });

  describe('get-last-entry-time', () => {
    it('returns timestamp of last entry', () => {
      const result = run('get-last-entry-time .');
      assert.strictEqual(result.exitCode, 0);
      const parsed = JSON.parse(result.stdout);
      assert.strictEqual(parsed.status, 'found');
      assert.ok(parsed.timestamp);
    });

    it('returns none when no entries exist', () => {
      fs.rmSync(path.join(TEST_DIR, 'CLAUDE.md updates.md'), { force: true });
      const result = run('get-last-entry-time .');
      assert.strictEqual(result.exitCode, 0);
      const parsed = JSON.parse(result.stdout);
      assert.strictEqual(parsed.status, 'none');
    });
  });
});

// The tool ships into every project's bin/. There, `../package.json` is the
// PROJECT's (or absent) — the GSD-T version must come from the installed
// version file, never the project's package. [RULE] changelog-version-from-gsdt-not-project
describe('M110: version stamp from a project copy', () => {
  const os = require('os');
  function inProjectCopy(projectPkg) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'm110-copy-'));
    const home = path.join(root, 'home');
    fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
    fs.writeFileSync(path.join(home, '.claude', '.gsd-t-version'), '9.9.99\n');
    const proj = path.join(root, 'proj');
    fs.mkdirSync(path.join(proj, 'bin'), { recursive: true });
    fs.copyFileSync(CLI, path.join(proj, 'bin', 'gsd-t-claude-md-changelog.cjs'));
    if (projectPkg) fs.writeFileSync(path.join(proj, 'package.json'), JSON.stringify(projectPkg));
    const out = execSync(`node bin/gsd-t-claude-md-changelog.cjs append . rewritten "from copy"`,
      { encoding: 'utf8', cwd: proj, env: { ...process.env, HOME: home } });
    const log = fs.readFileSync(path.join(proj, 'CLAUDE.md updates.md'), 'utf8');
    fs.rmSync(root, { recursive: true, force: true });
    return { out, log };
  }

  it('works in a project with no package.json (a new, docs-only project)', () => {
    const { log } = inProjectCopy(null);
    assert.ok(log.includes('GSD-T v9.9.99'), log);
  });

  it('never stamps the project\'s own version as the GSD-T version', () => {
    const { log } = inProjectCopy({ name: 'some-app', version: '1.2.3' });
    assert.ok(log.includes('GSD-T v9.9.99'), log);
    assert.ok(log.includes('project v1.2.3'), log);
  });
});
