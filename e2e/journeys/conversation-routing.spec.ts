// Journey — conversation-routing
// End-to-end functional assertion: when ONE node-runtime hook process serves
// MULTIPLE parallel Claude Code sessions, each session's NDJSON must land in
// the correct project's `.gsd-t/transcripts/` dir.
//
// Why this spec exists: M53b incident report — the conversation-capture hook
// fell through `payload.cwd` (which is the launch cwd of the node process,
// NOT the session's project) and `process.cwd()` (same problem) when no env
// override was set. Result: Project-A's assistant frames landed in
// Project-B's transcripts/. Two parallel orchestrators silently cross-talked
// for two weeks.
//
// The fix: derive project root from `payload.transcript_path` (which IS
// session-specific — it's `~/.claude/projects/{slug}/{sid}.jsonl` and the
// slug is the project root with `/` replaced by `-`).
//
// This spec MUST fail if any of:
//   - the hook regresses to ignoring `transcript_path` and falling through
//     to cwd / process.cwd() (frames misroute again)
//   - the slug decoder uses the slug literally as a path (no slug→path)
//   - the slug decoder skips the `.gsd-t/` existence check (slug-targets
//     a non-GSD-T directory and frames land outside the actual project)
//   - parallel hook invocations cross-talk (Project-A's frame in Project-B)

import { test, expect } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const HOOK = path.resolve(__dirname, '..', '..', 'scripts', 'hooks', 'gsd-t-conversation-capture.js');

let baseTmp: string;

function encodeSlug(absPath: string): string {
  // Mirror Claude Code's slug scheme: replace every '/' with '-'.
  return absPath.replace(/\//g, '-');
}

function mkProject(name: string): string {
  // Use a deep tree under baseTmp so the slug-decoder has multiple segments
  // to walk down — exercises the DFS algorithm, not just a single-segment
  // happy-path.
  const root = path.join(baseTmp, 'fake-disk', 'Users', 'david', 'projects', name);
  fs.mkdirSync(path.join(root, '.gsd-t'), { recursive: true });
  fs.writeFileSync(path.join(root, '.gsd-t', 'progress.md'), '# progress\n', 'utf8');
  return root;
}

function mkFakeHome(): string {
  const home = fs.mkdtempSync(path.join(baseTmp, 'fake-home-'));
  fs.mkdirSync(path.join(home, '.claude', 'projects'), { recursive: true });
  return home;
}

function mkTranscript(home: string, slug: string, sid: string, body: string | null): string {
  const dir = path.join(home, '.claude', 'projects', slug);
  fs.mkdirSync(dir, { recursive: true });
  const tp = path.join(dir, sid + '.jsonl');
  if (body == null) {
    fs.writeFileSync(tp, '', 'utf8');
  } else {
    fs.writeFileSync(
      tp,
      JSON.stringify({
        type: 'assistant',
        isSidechain: false,
        message: { role: 'assistant', content: [{ type: 'text', text: body }] },
      }) + '\n',
      'utf8',
    );
  }
  return tp;
}

function fireHook(payload: Record<string, unknown>, opts: { cwd: string; home: string }) {
  // Strip GSD_T_PROJECT_DIR from the inherited env: that's the only way to
  // exercise the production code path where slug-decode is the only
  // session-specific signal.
  const env: NodeJS.ProcessEnv = { ...process.env, HOME: opts.home };
  delete env.GSD_T_PROJECT_DIR;
  return spawnSync('node', [HOOK], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    env,
    cwd: opts.cwd,
  });
}

function readNdjson(p: string): any[] {
  if (!fs.existsSync(p)) return [];
  return fs.readFileSync(p, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

function ndjsonPath(projectDir: string, sid: string): string {
  return path.join(projectDir, '.gsd-t', 'transcripts', 'in-session-' + sid + '.ndjson');
}

test.beforeAll(() => {
  baseTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'm53b-routing-jrn-'));
});

test.afterAll(() => {
  try { fs.rmSync(baseTmp, { recursive: true, force: true }); } catch { /* ignore */ }
});

test('two parallel sessions: each NDJSON lands in its OWN project (no cross-talk)', () => {
  // Two real GSD-T projects on disk. The hook process's cwd is set to a
  // SHARED neutral dir (mimics the case where the launching shell is not
  // either project's root — the M53b incident exact shape).
  const projA = mkProject('GSD-T-fixture');
  const projB = mkProject('Move-Zoom-Recordings-to-GDrive');
  const home = mkFakeHome();
  const sidA = 'jrn-route-A-' + 'a'.repeat(8);
  const sidB = 'jrn-route-B-' + 'b'.repeat(8);
  const bodyA = 'BODY-A-marker-route-' + 'a'.repeat(6);
  const bodyB = 'BODY-B-marker-route-' + 'b'.repeat(6);
  const tpA = mkTranscript(home, encodeSlug(projA), sidA, bodyA);
  const tpB = mkTranscript(home, encodeSlug(projB), sidB, bodyB);

  // Use a neutral cwd that is NEITHER project. Without the slug-decode fix,
  // the hook walks up from this cwd, finds no .gsd-t/, and silently no-ops
  // — OR (worse, with cwd matching one of the projects) misroutes. We
  // deliberately pick `baseTmp` which has no .gsd-t/ to make the
  // misroute-via-walk-up scenario impossible to mask the bug.
  const sharedCwd = baseTmp;

  const resA = fireHook(
    { hook_event_name: 'Stop', session_id: sidA, transcript_path: tpA },
    { cwd: sharedCwd, home },
  );
  expect(resA.status, 'hook fire A must exit cleanly').toBe(0);

  const resB = fireHook(
    { hook_event_name: 'Stop', session_id: sidB, transcript_path: tpB },
    { cwd: sharedCwd, home },
  );
  expect(resB.status, 'hook fire B must exit cleanly').toBe(0);

  // INVARIANT 1: A's frame lands in A's project, not B's.
  const aFrames = readNdjson(ndjsonPath(projA, sidA));
  expect(
    aFrames,
    'project A must receive exactly its own session frame — empty means slug-decode regressed',
  ).toHaveLength(1);
  expect(aFrames[0].type).toBe('assistant_turn');
  expect(aFrames[0].content).toBe(bodyA);
  expect(
    aFrames[0].content,
    'project A frame must NOT contain B\'s body (cross-talk)',
  ).not.toBe(bodyB);

  // INVARIANT 2: B's frame lands in B's project, not A's.
  const bFrames = readNdjson(ndjsonPath(projB, sidB));
  expect(
    bFrames,
    'project B (literal-hyphen name) must receive its own session frame — empty means slug DFS regressed on tricky names',
  ).toHaveLength(1);
  expect(bFrames[0].content).toBe(bodyB);

  // INVARIANT 3: NO cross-routed files. A's session must not appear under
  // B's transcripts/ AND vice versa. This is the canonical M53b bug shape.
  expect(fs.existsSync(ndjsonPath(projB, sidA)), 'session A must not land in project B').toBe(false);
  expect(fs.existsSync(ndjsonPath(projA, sidB)), 'session B must not land in project A').toBe(false);

  // INVARIANT 4: Neutral cwd must NOT have grown a transcripts/ dir. A
  // walk-up regression would create one wherever cwd is.
  expect(
    fs.existsSync(path.join(sharedCwd, '.gsd-t', 'transcripts')),
    'neutral cwd must have no transcripts/ — proves walk-up did not fire',
  ).toBe(false);
});

test('slug pointing at a non-GSD-T directory: frame does NOT land there (existence check enforced)', () => {
  // Adversary: hook decodes the slug literally and writes there, even though
  // the target has no `.gsd-t/`. This spec catches that regression.
  const realProj = mkProject('RealProjectForFallback');
  // Build a non-GSD-T directory whose slug we'll point transcript_path at.
  const noGsdt = path.join(baseTmp, 'fake-disk', 'Users', 'david', 'no-gsdt-here');
  fs.mkdirSync(noGsdt, { recursive: true });
  const home = mkFakeHome();
  const sid = 'jrn-no-gsdt-' + 'c'.repeat(10);
  const tp = mkTranscript(home, encodeSlug(noGsdt), sid, 'should fall through');

  fireHook(
    { hook_event_name: 'Stop', session_id: sid, transcript_path: tp },
    { cwd: realProj, home },
  );

  // Slug-decoded target had no `.gsd-t/`; cwd fallback (realProj) wins.
  const frames = readNdjson(ndjsonPath(realProj, sid));
  expect(frames, 'cwd fallback must fire when slug target lacks .gsd-t/').toHaveLength(1);
  expect(frames[0].content).toBe('should fall through');

  // Critical adversary check: the non-GSD-T dir must NOT have a transcripts/
  // tree planted under it. A naive slug-decoder that skips the existence
  // check would create one here.
  expect(
    fs.existsSync(path.join(noGsdt, '.gsd-t', 'transcripts')),
    'non-GSD-T target must remain pristine — slug-decoder MUST require .gsd-t/',
  ).toBe(false);
});

test('slug used literally (no decode) would write to ~/.claude/projects/{slug}/.gsd-t — must NOT happen', () => {
  // Adversary: hook treats the slug as a directory name and writes there.
  // This spec catches it: the slug-as-literal-path target has no `.gsd-t/`
  // and the slug must be DECODED, not used as-is.
  const realProj = mkProject('RealProjectForLiteralSlug');
  const home = mkFakeHome();
  const sid = 'jrn-literal-slug-' + 'd'.repeat(10);
  const tp = mkTranscript(home, encodeSlug(realProj), sid, 'literal slug attack');

  // The slug (e.g. `-tmp-xxxxx-fake-disk-Users-david-projects-RealProjectForLiteralSlug`)
  // is the dir name under ~/.claude/projects/. If the hook used the slug as
  // a literal path, it'd try to write to `<that-slug-dir>/.gsd-t/transcripts/`.
  // The spec asserts that did NOT happen.
  const literalSlugDir = path.dirname(tp); // ~/.claude/projects/{slug}/
  const literalAttackPath = path.join(literalSlugDir, '.gsd-t', 'transcripts');

  fireHook(
    { hook_event_name: 'Stop', session_id: sid, transcript_path: tp },
    { cwd: realProj, home },
  );

  // Frame landed in the real project (slug correctly decoded).
  const frames = readNdjson(ndjsonPath(realProj, sid));
  expect(frames, 'frame must land in decoded project, not literal slug dir').toHaveLength(1);
  expect(frames[0].content).toBe('literal slug attack');

  // The literal slug directory must NOT have grown a transcripts/ tree.
  expect(
    fs.existsSync(literalAttackPath),
    'literal-slug attack: `~/.claude/projects/{slug}/.gsd-t/transcripts/` must NOT exist',
  ).toBe(false);
});
