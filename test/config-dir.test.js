'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const cfg = require('../bin/gsd-t-config-dir.cjs');

function fakeHome() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'gsdt-cfgdir-'));
  const claude = path.join(home, '.claude');
  fs.mkdirSync(path.join(claude, 'commands'), { recursive: true });
  fs.mkdirSync(path.join(claude, 'projects'), { recursive: true });
  fs.writeFileSync(path.join(claude, 'CLAUDE.md'), '# rules\n');
  fs.writeFileSync(path.join(claude, 'settings.json'), '{}\n');
  return { home, claude, target: path.join(home, '.claude-hilo') };
}

test('links every shared item that exists, skips absent ones, registers the dir', () => {
  const { claude, target } = fakeHome();
  const r = cfg.linkConfigDir(claude, target);
  assert.strictEqual(r.ok, true);
  for (const name of ['CLAUDE.md', 'settings.json', 'commands', 'projects']) {
    const dst = path.join(target, name);
    assert.ok(fs.lstatSync(dst).isSymbolicLink(), `${name} should be a link`);
    assert.strictEqual(fs.realpathSync(dst), fs.realpathSync(path.join(claude, name)));
  }
  assert.strictEqual(fs.existsSync(path.join(target, 'skills')), false, 'absent item not created');
  assert.deepStrictEqual(cfg.readRegistry(claude), [path.resolve(target)]);
});

test('re-run is a no-op and the registry is not duplicated', () => {
  const { claude, target } = fakeHome();
  cfg.linkConfigDir(claude, target);
  const r = cfg.linkConfigDir(claude, target);
  assert.strictEqual(r.ok, true);
  assert.ok(r.rows.every((x) => x.state === 'ok' || x.state === 'absent'));
  assert.strictEqual(cfg.readRegistry(claude).length, 1);
});

test('login files in the target are never touched', () => {
  const { claude, target } = fakeHome();
  fs.mkdirSync(target);
  fs.writeFileSync(path.join(target, '.claude.json'), '{"account":"hilo"}');
  fs.writeFileSync(path.join(target, '.credentials.json'), 'secret');
  cfg.linkConfigDir(claude, target);
  assert.strictEqual(fs.readFileSync(path.join(target, '.claude.json'), 'utf8'), '{"account":"hilo"}');
  assert.strictEqual(fs.readFileSync(path.join(target, '.credentials.json'), 'utf8'), 'secret');
  assert.strictEqual(fs.lstatSync(path.join(target, '.claude.json')).isSymbolicLink(), false);
});

test('a real file in the way halts the whole run and changes nothing', () => {
  const { claude, target } = fakeHome();
  fs.mkdirSync(target);
  fs.writeFileSync(path.join(target, 'settings.json'), '{"mine":true}');
  const r = cfg.linkConfigDir(claude, target);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.error, 'conflicts');
  assert.strictEqual(fs.readFileSync(path.join(target, 'settings.json'), 'utf8'), '{"mine":true}');
  assert.strictEqual(fs.existsSync(path.join(target, 'CLAUDE.md')), false, 'no partial link set');
  assert.deepStrictEqual(cfg.readRegistry(claude), []);
});

test('a link pointing somewhere else is a conflict', () => {
  const { home, claude, target } = fakeHome();
  fs.mkdirSync(target);
  fs.mkdirSync(path.join(home, 'elsewhere'));
  fs.symlinkSync(path.join(home, 'elsewhere'), path.join(target, 'commands'));
  const r = cfg.linkConfigDir(claude, target);
  assert.strictEqual(r.ok, false);
  assert.match(r.rows.find((x) => x.name === 'commands').reason, /links to/);
});

test('refuses ~/.claude itself, a dir inside it, a dir containing it, and a symlinked target', () => {
  const { home, claude } = fakeHome();
  assert.match(cfg.linkConfigDir(claude, claude).error, /itself/);
  assert.match(cfg.linkConfigDir(claude, path.join(claude, 'x')).error, /inside/);
  assert.match(cfg.linkConfigDir(claude, home).error, /contains/);
  const real = path.join(home, 'real');
  fs.mkdirSync(real);
  fs.symlinkSync(real, path.join(home, '.claude-link'));
  assert.match(cfg.linkConfigDir(claude, path.join(home, '.claude-link')).error, /symlink/);
});

test('doctor check: healthy, then flags a missing link, a new shared item, and a missing dir', () => {
  const { claude, target } = fakeHome();
  cfg.linkConfigDir(claude, target);
  assert.deepStrictEqual(cfg.checkConfigDirs(claude), []);

  fs.unlinkSync(path.join(target, 'CLAUDE.md'));
  fs.mkdirSync(path.join(claude, 'skills'));
  const names = cfg.checkConfigDirs(claude).map((p) => p.problem);
  assert.ok(names.some((n) => n.startsWith('CLAUDE.md')));
  assert.ok(names.some((n) => n.startsWith('skills')));

  fs.rmSync(target, { recursive: true });
  assert.deepStrictEqual(cfg.checkConfigDirs(claude).map((p) => p.problem), ['directory is missing']);
});

test('login files are not in the shared list', () => {
  for (const f of ['.claude.json', '.credentials.json']) assert.ok(!cfg.SHARED.includes(f));
});
