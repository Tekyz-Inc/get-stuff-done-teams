/**
 * M53b — conversation-capture project-routing fix.
 *
 * Defends against the parallel-session misrouting bug where one node-runtime
 * hook process serves multiple Claude Code sessions and `process.cwd()` /
 * `payload.cwd` resolve to the wrong project. The fix decodes
 * `payload.transcript_path`'s `~/.claude/projects/{slug}/{sid}.jsonl` back
 * to a real project root by walking the filesystem.
 *
 * Tests cover:
 *   - happy path: slug-decoded path that contains `.gsd-t/` is preferred
 *     over a misleading `process.cwd()`
 *   - slug encoding ambiguity (literal `-` in directory names like
 *     `Move-Zoom-Recordings-to-GDrive`) — the disk is the oracle
 *   - non-existent slug → falls through to next priority
 *   - path-traversal slug (containing `..`) → ignored
 *   - malformed slug (slashes, leading character mismatch) → ignored
 *   - existing fallback chain still works when no transcript_path
 *
 * Contract: `.gsd-t/contracts/conversation-capture-contract.md` v1.2.0.
 */
"use strict";

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");

const HOOK = path.join(__dirname, "..", "scripts", "hooks", "gsd-t-conversation-capture.js");

let baseTmp;

before(() => {
  baseTmp = fs.mkdtempSync(path.join(os.tmpdir(), "gsd-t-m53b-routing-"));
});

after(() => {
  fs.rmSync(baseTmp, { recursive: true, force: true });
});

// Build a fake project tree on disk so the slug-decoder's fs.existsSync probes
// can resolve. The "slug" is what Claude Code would have written into
// `~/.claude/projects/`. We encode by replacing `/` with `-` (Claude Code's
// scheme) and prefix a leading `-` for the leading `/`.
function encodeSlug(absPath) {
  if (!path.isAbsolute(absPath)) throw new Error("slug encoding requires absolute path");
  // Replace '/' with '-'. Leading '/' becomes a leading '-'.
  return absPath.replace(/\//g, "-");
}

function mkTreeProject(name) {
  // Materialize a project root deep inside baseTmp (so the absolute path has
  // multiple segments to exercise the DFS walk-down).
  const root = path.join(baseTmp, "fake-disk", "Users", "david", "projects", name);
  fs.mkdirSync(path.join(root, ".gsd-t"), { recursive: true });
  fs.writeFileSync(path.join(root, ".gsd-t", "progress.md"), "# progress\n", "utf8");
  return root;
}

function mkTranscriptUnderHome(home, slug, sid, body) {
  const projects = path.join(home, ".claude", "projects", slug);
  fs.mkdirSync(projects, { recursive: true });
  const tp = path.join(projects, sid + ".jsonl");
  const lines = body == null
    ? []
    : [
        JSON.stringify({
          type: "assistant",
          isSidechain: false,
          message: { role: "assistant", content: [{ type: "text", text: body }] },
        }),
      ];
  fs.writeFileSync(tp, lines.length ? lines.join("\n") + "\n" : "", "utf8");
  return tp;
}

function mkFakeHome() {
  const home = fs.mkdtempSync(path.join(baseTmp, "fake-home-"));
  fs.mkdirSync(path.join(home, ".claude", "projects"), { recursive: true });
  return home;
}

function runHook(payload, { cwd, env = {} } = {}) {
  // Critical: do NOT pass GSD_T_PROJECT_DIR here. The bug we're fixing exists
  // only when no env override is set — that's the production path. Strip any
  // inherited GSD_T_PROJECT_DIR.
  const mergedEnv = { ...process.env, ...env };
  delete mergedEnv.GSD_T_PROJECT_DIR;
  return spawnSync("node", [HOOK], {
    input: JSON.stringify(payload),
    encoding: "utf8",
    env: mergedEnv,
    cwd: cwd || process.cwd(),
  });
}

function readNdjson(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return fs
    .readFileSync(filePath, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map(JSON.parse);
}

function ndjsonPath(projectDir, sessionId) {
  return path.join(projectDir, ".gsd-t", "transcripts", "in-session-" + sessionId + ".ndjson");
}

describe("M53b project routing: transcript_path slug-decode", () => {
  it("routes Stop frame to the project encoded in transcript_path, NOT cwd", () => {
    // Two sibling projects on disk. The hook process's cwd will be the WRONG
    // one. The transcript_path encodes the RIGHT one. The fix must prefer
    // the transcript_path slug.
    const right = mkTreeProject("RightProject");
    const wrong = mkTreeProject("WrongProject");
    const home = mkFakeHome();
    const sid = "sess-routing-001";
    const tp = mkTranscriptUnderHome(home, encodeSlug(right), sid, "from RIGHT");

    const result = runHook(
      { hook_event_name: "Stop", session_id: sid, transcript_path: tp },
      { cwd: wrong, env: { HOME: home } }
    );
    assert.equal(result.status, 0);

    // RIGHT project's NDJSON exists with the assistant body.
    const rightFrames = readNdjson(ndjsonPath(right, sid));
    assert.equal(rightFrames.length, 1, "Stop frame must land in RIGHT project");
    assert.equal(rightFrames[0].type, "assistant_turn");
    assert.equal(rightFrames[0].content, "from RIGHT");

    // WRONG project must NOT have any frames written for this session.
    assert.equal(fs.existsSync(ndjsonPath(wrong, sid)), false,
      "WRONG project must not receive any frame — that's the misroute bug");
  });

  it("disambiguates slugs whose project name contains literal '-' (Move-Zoom-Recordings-to-GDrive)", () => {
    // Real-world case from the M53b incident report. Project name has multiple
    // literal hyphens. Slug-decode is ambiguous unless the disk is consulted.
    const tricky = mkTreeProject("Move-Zoom-Recordings-to-GDrive");
    const home = mkFakeHome();
    const sid = "sess-tricky-002";
    // Slug encoding folds the literal hyphens with path-separator hyphens.
    const tp = mkTranscriptUnderHome(home, encodeSlug(tricky), sid, "tricky body");

    const result = runHook(
      { hook_event_name: "Stop", session_id: sid, transcript_path: tp },
      { cwd: baseTmp, env: { HOME: home } }
    );
    assert.equal(result.status, 0);

    const frames = readNdjson(ndjsonPath(tricky, sid));
    assert.equal(frames.length, 1, "frame must land in the literal-hyphen project");
    assert.equal(frames[0].content, "tricky body");
  });

  it("two parallel hook invocations write to two different projects (no cross-talk)", () => {
    // Simulates the original incident: two Claude Code sessions running in
    // parallel, one shared hook script. Each invocation carries its own
    // transcript_path; each frame must land in the matching project.
    const projA = mkTreeProject("ParallelA");
    const projB = mkTreeProject("ParallelB");
    const home = mkFakeHome();
    const sidA = "sess-parallel-A";
    const sidB = "sess-parallel-B";
    const tpA = mkTranscriptUnderHome(home, encodeSlug(projA), sidA, "body A");
    const tpB = mkTranscriptUnderHome(home, encodeSlug(projB), sidB, "body B");

    // Both invocations use the SAME cwd to mimic the parallel-sessions race.
    runHook(
      { hook_event_name: "Stop", session_id: sidA, transcript_path: tpA },
      { cwd: baseTmp, env: { HOME: home } }
    );
    runHook(
      { hook_event_name: "Stop", session_id: sidB, transcript_path: tpB },
      { cwd: baseTmp, env: { HOME: home } }
    );

    const aFrames = readNdjson(ndjsonPath(projA, sidA));
    const bFrames = readNdjson(ndjsonPath(projB, sidB));
    assert.equal(aFrames.length, 1);
    assert.equal(bFrames.length, 1);
    assert.equal(aFrames[0].content, "body A");
    assert.equal(bFrames[0].content, "body B");

    // Critical: A's session id must NOT appear under B's project, and vice versa.
    assert.equal(fs.existsSync(ndjsonPath(projB, sidA)), false,
      "session A frame must not leak into project B");
    assert.equal(fs.existsSync(ndjsonPath(projA, sidB)), false,
      "session B frame must not leak into project A");
  });

  it("slug encoding a directory that does NOT exist with .gsd-t/ → falls through", () => {
    // Slug decodes to a real directory but that directory has no `.gsd-t/`.
    // The decoder must reject it so the next priority (cwd) gets a chance.
    const realProj = mkTreeProject("FallthroughTarget"); // has .gsd-t
    const noGsdtRoot = path.join(baseTmp, "fake-disk", "Users", "david", "no-gsdt-here");
    fs.mkdirSync(noGsdtRoot, { recursive: true });
    const home = mkFakeHome();
    const sid = "sess-fallthrough-003";
    const slug = encodeSlug(noGsdtRoot); // points at the non-GSD-T dir
    const tp = mkTranscriptUnderHome(home, slug, sid, "ignored");

    runHook(
      { hook_event_name: "Stop", session_id: sid, transcript_path: tp },
      { cwd: realProj, env: { HOME: home } }
    );

    // Slug rejected (no `.gsd-t/`); cwd (realProj) accepted.
    const frames = readNdjson(ndjsonPath(realProj, sid));
    assert.equal(frames.length, 1, "fallback to cwd must fire when slug target lacks .gsd-t/");

    // The non-GSD-T dir must NOT have a transcripts/ tree planted under it.
    assert.equal(fs.existsSync(path.join(noGsdtRoot, ".gsd-t", "transcripts")), false);
  });

  it("malformed transcript_path (path traversal '..') → ignored, falls through", () => {
    const realProj = mkTreeProject("TraversalTarget");
    const home = mkFakeHome();
    const sid = "sess-traversal-004";
    // Build a transcript_path under the allowed root that LOOKS legitimate
    // but, when interpreted as a slug, would traverse out (`-..-etc-passwd`).
    // The decoder must reject the slug.
    const projects = path.join(home, ".claude", "projects");
    const evilSlug = "-..-etc-passwd";
    const projDir = path.join(projects, evilSlug);
    fs.mkdirSync(projDir, { recursive: true });
    const tp = path.join(projDir, sid + ".jsonl");
    fs.writeFileSync(tp, "", "utf8");

    runHook(
      { hook_event_name: "Stop", session_id: sid, transcript_path: tp },
      { cwd: realProj, env: { HOME: home } }
    );

    // Slug rejected; cwd fallback wins.
    const frames = readNdjson(ndjsonPath(realProj, sid));
    assert.equal(frames.length, 1);
    assert.equal(frames[0].type, "assistant_turn");

    // /etc/passwd untouched (we didn't even try, but make the assertion
    // explicit so a future regression that *does* try would surface).
    assert.equal(fs.existsSync("/etc/.gsd-t"), false,
      "/etc/.gsd-t must not exist on the test host (sanity)");
  });

  it("missing transcript_path → falls through to existing cwd resolution", () => {
    // Pre-existing fallback path stays intact.
    const proj = mkTreeProject("CwdFallthrough");
    const sid = "sess-cwd-only-005";
    runHook(
      { hook_event_name: "Stop", session_id: sid, assistant_message: "fallback wins" },
      { cwd: proj }
    );
    const frames = readNdjson(ndjsonPath(proj, sid));
    assert.equal(frames.length, 1);
    assert.equal(frames[0].content, "fallback wins");
  });

  it("UserPromptSubmit also routes by transcript_path slug when present", () => {
    // UserPromptSubmit may carry transcript_path on newer Claude Code builds.
    // The fix must apply uniformly across hook events — not just Stop.
    const right = mkTreeProject("UserPromptRight");
    const wrong = mkTreeProject("UserPromptWrong");
    const home = mkFakeHome();
    const sid = "sess-userprompt-006";
    const tp = mkTranscriptUnderHome(home, encodeSlug(right), sid, null);

    runHook(
      {
        hook_event_name: "UserPromptSubmit",
        session_id: sid,
        prompt: "user message",
        transcript_path: tp,
      },
      { cwd: wrong, env: { HOME: home } }
    );

    const rightFrames = readNdjson(ndjsonPath(right, sid));
    assert.equal(rightFrames.length, 1);
    assert.equal(rightFrames[0].type, "user_turn");
    assert.equal(rightFrames[0].content, "user message");
    assert.equal(fs.existsSync(ndjsonPath(wrong, sid)), false);
  });

  it("env var GSD_T_PROJECT_DIR still beats slug (operator override preserved)", () => {
    const slugTarget = mkTreeProject("SlugTarget");
    const envTarget = mkTreeProject("EnvTarget");
    const home = mkFakeHome();
    const sid = "sess-env-priority-007";
    const tp = mkTranscriptUnderHome(home, encodeSlug(slugTarget), sid, "ignored");

    // Pass GSD_T_PROJECT_DIR explicitly. Env priority must still win.
    const result = spawnSync("node", [HOOK], {
      input: JSON.stringify({ hook_event_name: "Stop", session_id: sid, transcript_path: tp }),
      encoding: "utf8",
      env: { ...process.env, GSD_T_PROJECT_DIR: envTarget, HOME: home },
      cwd: baseTmp,
    });
    assert.equal(result.status, 0);

    const envFrames = readNdjson(ndjsonPath(envTarget, sid));
    assert.equal(envFrames.length, 1, "env override must short-circuit slug decode");
    assert.equal(fs.existsSync(ndjsonPath(slugTarget, sid)), false);
  });
});

describe("M53b: _slugToProjectDir / _slugFromTranscriptPath unit-level", () => {
  // Direct exercises of the helpers, including malformed inputs.
  const { _internal } = require(HOOK);
  const { _slugToProjectDir, _slugFromTranscriptPath } = _internal;

  it("rejects slug not starting with '-' (must encode leading '/')", () => {
    assert.equal(_slugToProjectDir("Users-david-projects"), null);
  });

  it("rejects slug containing '..' (path-traversal sentinel)", () => {
    assert.equal(_slugToProjectDir("-..-etc-passwd"), null);
  });

  it("rejects slug containing literal '/' (already partially decoded — abort)", () => {
    assert.equal(_slugToProjectDir("-Users-david/projects"), null);
  });

  it("rejects slug containing NUL byte", () => {
    assert.equal(_slugToProjectDir("-Users-\0david"), null);
  });

  it("returns null for slug whose decoded paths don't exist on disk", () => {
    assert.equal(_slugToProjectDir("-no-such-tree-abcdef"), null);
  });

  it("decodes a slug whose target has .gsd-t/", () => {
    const proj = mkTreeProject("DirectDecode-1");
    const slug = encodeSlug(proj);
    assert.equal(_slugToProjectDir(slug), proj);
  });

  it("_slugFromTranscriptPath extracts slug from path under ~/.claude/projects/", () => {
    const home = mkFakeHome();
    const oldHome = process.env.HOME;
    process.env.HOME = home;
    try {
      const slug = "-Users-david-projects-Foo";
      const tp = path.join(home, ".claude", "projects", slug, "abc.jsonl");
      assert.equal(_slugFromTranscriptPath(tp), slug);
    } finally {
      process.env.HOME = oldHome;
    }
  });

  it("_slugFromTranscriptPath returns null for path outside ~/.claude/projects/", () => {
    const home = mkFakeHome();
    const oldHome = process.env.HOME;
    process.env.HOME = home;
    try {
      assert.equal(_slugFromTranscriptPath("/etc/passwd"), null);
    } finally {
      process.env.HOME = oldHome;
    }
  });
});
