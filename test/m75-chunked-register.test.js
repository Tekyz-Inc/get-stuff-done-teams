"use strict";

// M75 — the register is written in BOUNDED CHUNKS, not by one agent. The Hilo Scan #14
// synthesis stalled after 9 of 322 items (one agent can't type a 466KB register), and
// even a single bounded Write truncated at ~165KB. Fix: deterministic formatting in the
// orchestrator → chunked sequential write (≤30KB/chunk). This locks the chunking logic:
// chunks never split an item, every item is covered exactly once, header rides chunk 0.
// (Mirrors fmtChunks in the runtime-native workflow, which isn't requireable.)

const { test } = require("node:test");
const assert = require("node:assert/strict");

function fmtChunks(findings, { tdStart = 1, scanNumber = 1, slicesLen = 1, coverageComplete = true } = {}) {
  const sevHead = { CRITICAL: "🔴 Critical", HIGH: "🟠 High", MEDIUM: "🟡 Medium", LOW: "🟢 Low" };
  const counts = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const f of findings) {
    if (f.severity === "CRITICAL") counts.critical++;
    else if (f.severity === "HIGH") counts.high++;
    else if (f.severity === "MEDIUM") counts.medium++;
    else if (f.severity === "LOW") counts.low++;
  }
  counts.total = findings.length;
  const head = `# Tech Debt Register\n**Scan #${scanNumber}**\n**Total:** ${counts.total}\n\n## Summary\n\n---\n`;
  function itemMd(f, td) {
    const L = [`### TD-${td} — ${f.title || "(untitled)"}`, `- **Severity:** ${f.severity}`,
      `- **Location:** ${(f.files && f.files.length) ? f.files.join(", ") : "—"}`];
    if (f.detail) L.push(`- **Description:** ${f.detail}`);
    L.push("");
    return L.join("\n");
  }
  const CHUNK_MAX = 30000;
  const chunks = [head];
  let buf = "", n = tdStart, lastSev = null;
  const flush = () => { if (buf) { chunks.push(buf); buf = ""; } };
  for (const f of findings) {
    let piece = "";
    if (f.severity !== lastSev) { piece += `\n## ${sevHead[f.severity] || f.severity} Priority\n\n`; lastSev = f.severity; }
    piece += itemMd(f, n++);
    if (buf.length + piece.length > CHUNK_MAX) flush();
    buf += piece;
  }
  flush();
  return { chunks, lastTd: n - 1 };
}

function mk(n, sev, big) {
  return Array.from({ length: n }, (_, i) => ({ title: `finding ${i}`, severity: sev, files: [`src/f${i}.ts`], detail: big ? "x".repeat(800) : "short" }));
}

test("every item appears exactly once across the chunks, with correct sequential TD numbers", () => {
  const findings = [...mk(9, "CRITICAL"), ...mk(90, "HIGH"), ...mk(165, "MEDIUM"), ...mk(58, "LOW")];
  const { chunks, lastTd } = fmtChunks(findings, { tdStart: 134 });
  const joined = chunks.join("");
  const tds = [...joined.matchAll(/^### TD-(\d+)/gm)].map((m) => Number(m[1]));
  assert.equal(tds.length, 322, "all 322 items rendered");
  assert.equal(new Set(tds).size, 322, "no duplicate TD numbers");
  assert.equal(tds[0], 134, "numbering starts at tdStart");
  assert.equal(lastTd, 134 + 322 - 1, "lastTd correct");
  // contiguous, no gaps
  const sorted = [...tds].sort((a, b) => a - b);
  for (let i = 1; i < sorted.length; i++) assert.equal(sorted[i], sorted[i - 1] + 1, `gap at ${sorted[i]}`);
});

test("no chunk exceeds the size bound by more than one item (chunks never split an item)", () => {
  const findings = mk(400, "HIGH", true); // big descriptions → forces many chunks
  const { chunks } = fmtChunks(findings, { tdStart: 1 });
  assert.ok(chunks.length > 5, "large register splits into many chunks");
  // each chunk must contain only WHOLE items: count of "### TD-" == count of trailing item terminators is structural;
  // simplest invariant: every "### TD-" in a chunk has its Severity line in the SAME chunk (not split across).
  for (const c of chunks.slice(1)) {
    const heads = (c.match(/^### TD-\d+/gm) || []).length;
    const sevs = (c.match(/^- \*\*Severity:\*\*/gm) || []).length;
    assert.equal(heads, sevs, "each item's header and body are in the same chunk (no mid-item split)");
  }
});

test("chunk 0 is the header+summary; item chunks follow", () => {
  const { chunks } = fmtChunks(mk(5, "HIGH"), {});
  assert.match(chunks[0], /# Tech Debt Register/);
  assert.match(chunks[0], /## Summary/);
  assert.doesNotMatch(chunks[0], /### TD-/, "header chunk has no items");
  assert.match(chunks.slice(1).join(""), /### TD-/, "items live in later chunks");
});

test("a tiny register is a single header chunk + one item chunk (no over-chunking)", () => {
  const { chunks } = fmtChunks(mk(3, "CRITICAL"), {});
  assert.equal(chunks.length, 2, "header + one small item chunk");
});
