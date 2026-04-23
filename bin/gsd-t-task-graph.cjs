"use strict";

/**
 * gsd-t-task-graph — M44 D1
 *
 * Parses `.gsd-t/domains/* /tasks.md` (and `scope.md` for fallback touch-lists)
 * into an in-memory DAG that downstream M44 domains consume:
 *   - D2 `gsd-t parallel` CLI
 *   - D4 dep-graph validation (veto on unmet deps)
 *   - D5 file-disjointness prover (touch-list overlap check)
 *   - D6 pre-spawn economics (per-task cost estimate)
 *
 * Contract: .gsd-t/contracts/task-graph-contract.md (v1.0.0)
 *
 * Hard rules (from constraints.md):
 *   - Zero external runtime deps (Node built-ins only)
 *   - Cycle detection MANDATORY → throws TaskGraphCycleError with cycle path
 *   - Read-only: never writes to tasks.md / scope.md
 *   - Synchronous; main build path < 200ms for 100-domain/1000-task project
 *   - Mode-agnostic: knows nothing about in-session vs unattended
 */

const fs = require("node:fs");
const path = require("node:path");

// ─── Custom error ─────────────────────────────────────────────────────────

class TaskGraphCycleError extends Error {
  constructor(cycle) {
    super(`Task graph cycle detected: ${Array.isArray(cycle) ? cycle.join(" → ") : "(unknown)"}`);
    this.name = "TaskGraphCycleError";
    this.cycle = Array.isArray(cycle) ? cycle.slice() : [];
  }
}

// ─── Status marker map ────────────────────────────────────────────────────

const STATUS_MAP = {
  " ": "pending",
  "x": "done",
  "X": "done",
  "-": "skipped",
  "!": "failed",
};

// ─── tasks.md parser ──────────────────────────────────────────────────────

/**
 * Parse a single tasks.md file into an array of partial task records.
 * Returns: { tasks: TaskNode[], warnings: string[] }
 */
function parseTasksMd(absPath, domainName) {
  let src;
  try {
    src = fs.readFileSync(absPath, "utf8");
  } catch {
    return { tasks: [], warnings: [`tasks.md unreadable: ${absPath}`] };
  }
  const lines = src.split(/\r?\n/);
  const tasks = [];
  const warnings = [];
  let currentWave = 0;
  let cur = null;

  const flush = () => {
    if (cur) {
      tasks.push(cur);
      cur = null;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Wave heading: "## Wave N — …"  (also tolerates "## Wave N -" / "## Wave N:")
    const waveMatch = line.match(/^##\s+Wave\s+(\d+)\b/i);
    if (waveMatch) {
      currentWave = parseInt(waveMatch[1], 10);
      continue;
    }

    // Task heading (Shape D — parser-canonical): "### M44-D1-T1 — Title"
    const taskMatch = line.match(/^###\s+([A-Z]\d+-D\d+-T\d+)\s*[—–\-]?\s*(.*)$/);
    if (taskMatch) {
      flush();
      cur = {
        id: taskMatch[1],
        domain: domainName,
        wave: currentWave,
        title: (taskMatch[2] || "").trim(),
        status: "pending",
        deps: [],
        touches: null, // null = unset (will fall back to scope.md); [] = explicit empty
        statusWarning: null,
        shape: "D",
      };
      continue;
    }

    // Task bullet (Shape C — bullet-with-bold-id, checkbox in heading):
    //   "- [ ] **M44-D9-T1** — Title"
    // Dependencies absent in Shape C source; touches come from an indented
    // "  - touches: a, b" sub-bullet below the task.
    const bulletMatch = line.match(/^-\s+\[(.)\]\s+\*\*([A-Z]\d+-D\d+-T\d+)\*\*\s*[—–\-]?\s*(.*)$/);
    if (bulletMatch) {
      flush();
      const marker = bulletMatch[1];
      let status = "pending";
      let statusWarning = null;
      if (STATUS_MAP[marker]) {
        status = STATUS_MAP[marker];
      } else {
        statusWarning = `unknown status marker '[${marker}]' on ${bulletMatch[2]} — treating as pending`;
      }
      cur = {
        id: bulletMatch[2],
        domain: domainName,
        wave: currentWave,
        title: (bulletMatch[3] || "").trim(),
        status,
        deps: [],
        touches: null,
        statusWarning,
        shape: "C",
      };
      continue;
    }

    if (!cur) continue;

    // Shape D field line: "- **Status**: [ ] pending"
    const fieldMatch = line.match(/^\s*-\s+\*\*([A-Za-z][\w\s]*?)\*\*\s*:\s*(.*)$/);
    if (fieldMatch) {
      const key = fieldMatch[1].trim().toLowerCase();
      const val = fieldMatch[2].trim();

      if (key === "status") {
        const m = val.match(/\[(.)\]/);
        if (m) {
          const marker = m[1];
          if (STATUS_MAP[marker]) {
            cur.status = STATUS_MAP[marker];
          } else {
            cur.status = "pending";
            cur.statusWarning = `unknown status marker '[${marker}]' on ${cur.id} — treating as pending`;
          }
        }
      } else if (key === "dependencies" || key === "deps") {
        cur.deps = parseDepList(val);
      } else if (key === "touches" || key === "files touched" || key === "touched") {
        cur.touches = parseFileList(val);
      }
      continue;
    }

    // Shape C sub-bullet field: "  - touches: a, b" or "  - deps: X, Y"
    const subFieldMatch = line.match(/^\s+-\s+([a-zA-Z][\w\s]*?)\s*:\s*(.*)$/);
    if (subFieldMatch && cur.shape === "C") {
      const key = subFieldMatch[1].trim().toLowerCase();
      const val = subFieldMatch[2].trim();
      if (key === "touches" || key === "files touched" || key === "touched") {
        cur.touches = parseFileList(val);
      } else if (key === "dependencies" || key === "deps") {
        cur.deps = parseDepList(val);
      }
    }
  }
  flush();

  for (const t of tasks) {
    if (t.statusWarning) warnings.push(t.statusWarning);
    delete t.statusWarning;
    delete t.shape;
  }
  return { tasks, warnings };
}

/**
 * Parse a dep list like "M44-D1-T2, M44-D7-T1" or "none".
 * Strips parenthetical comments: "M44-D1-T5 (D1 complete)" → "M44-D1-T5".
 */
function parseDepList(raw) {
  if (!raw || /^none$/i.test(raw.trim())) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .map((s) => s.replace(/\s*\(.*?\)\s*$/, "")) // drop "(D1 complete)" trailers
    .map((s) => {
      // Extract first token that looks like a task id
      const m = s.match(/[A-Z]\d+-D\d+-T\d+/);
      return m ? m[0] : s;
    })
    .filter((s) => /^[A-Z]\d+-D\d+-T\d+$/.test(s));
}

/**
 * Parse a comma-separated file list. Strips backticks and parentheticals.
 */
function parseFileList(raw) {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .map((s) => s.replace(/^`|`$/g, ""))
    .map((s) => s.replace(/\s*\(.*?\)\s*$/, "")) // drop "(new)" trailers
    .map((s) => s.replace(/^`|`$/g, ""))
    .filter(Boolean);
}

// ─── scope.md fallback parser (Files Owned section) ──────────────────────

/**
 * Parse the "## Files Owned" section of a domain's scope.md and return the
 * list of paths mentioned in bullet entries. Each bullet is normally:
 *     - `path/to/file.cjs` — description
 * but the parser is lenient: any backticked path or bare path-looking token
 * at the start of a `-` bullet counts.
 */
function parseScopeFilesOwned(absPath) {
  let src;
  try {
    src = fs.readFileSync(absPath, "utf8");
  } catch {
    return [];
  }
  const lines = src.split(/\r?\n/);
  const out = [];
  let inSection = false;
  for (const line of lines) {
    if (/^##\s+Files\s+Owned\b/i.test(line)) {
      inSection = true;
      continue;
    }
    if (inSection && /^##\s+/.test(line)) break; // next H2 ends the section
    if (!inSection) continue;
    const bullet = line.match(/^\s*-\s+(.*)$/);
    if (!bullet) continue;
    const text = bullet[1].trim();
    // Prefer backticked path
    const back = text.match(/`([^`\s]+)`/);
    if (back) {
      out.push(back[1]);
      continue;
    }
    // Fallback: first whitespace-delimited token that contains a slash or dot
    const tok = text.split(/\s+/)[0];
    if (tok && (tok.includes("/") || tok.includes("."))) {
      out.push(tok);
    }
  }
  return out;
}

// ─── Cycle detection (iterative DFS — three-color) ───────────────────────

function detectCycle(byId) {
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map();
  const parent = new Map();
  for (const id of Object.keys(byId)) color.set(id, WHITE);

  const ids = Object.keys(byId).sort(); // deterministic
  for (const start of ids) {
    if (color.get(start) !== WHITE) continue;
    // iterative DFS using an explicit stack of {id, depIdx}
    const stack = [{ id: start, depIdx: 0 }];
    color.set(start, GRAY);
    parent.set(start, null);
    while (stack.length) {
      const top = stack[stack.length - 1];
      const node = byId[top.id];
      const deps = node ? node.deps : [];
      if (top.depIdx >= deps.length) {
        color.set(top.id, BLACK);
        stack.pop();
        continue;
      }
      const next = deps[top.depIdx++];
      if (!byId[next]) {
        // unknown dep — not a cycle, skip (D4 reports unmet)
        continue;
      }
      const c = color.get(next);
      if (c === WHITE) {
        color.set(next, GRAY);
        parent.set(next, top.id);
        stack.push({ id: next, depIdx: 0 });
      } else if (c === GRAY) {
        // back-edge → cycle. Reconstruct path from `next` up via parent chain.
        const cyc = [next];
        let p = top.id;
        while (p && p !== next) {
          cyc.push(p);
          p = parent.get(p);
        }
        cyc.push(next); // close the loop visually
        cyc.reverse();
        throw new TaskGraphCycleError(cyc);
      }
      // BLACK → already fully explored, skip
    }
  }
}

// ─── Public API ───────────────────────────────────────────────────────────

/**
 * Build the task graph from .gsd-t/domains/<domain>/tasks.md (+ scope.md
 * fallback for touches). Synchronous. Throws TaskGraphCycleError on cycle.
 *
 * @param {{projectDir: string}} opts
 * @returns {{nodes: object[], edges: object[], ready: string[],
 *            byId: Object<string, object>, warnings: string[]}}
 */
function buildTaskGraph(opts) {
  const projectDir = (opts && opts.projectDir) || process.cwd();
  const domainsRoot = path.join(projectDir, ".gsd-t", "domains");
  const warnings = [];
  const nodes = [];
  const edges = [];
  const byId = Object.create(null);

  let domainDirs = [];
  try {
    domainDirs = fs.readdirSync(domainsRoot, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();
  } catch {
    return { nodes, edges, ready: [], byId, warnings: [`domains dir missing: ${domainsRoot}`] };
  }

  // Pass 1: parse tasks.md for each domain
  const scopeCache = new Map(); // domainName → string[] (Files Owned)
  for (const domain of domainDirs) {
    const tasksPath = path.join(domainsRoot, domain, "tasks.md");
    if (!fs.existsSync(tasksPath)) continue;
    const { tasks, warnings: ws } = parseTasksMd(tasksPath, domain);
    for (const w of ws) warnings.push(w);
    if (tasks.length === 0) {
      // tasks.md exists but no tasks matched any known shape. Heuristic check
      // for an unsupported shape so the caller knows to author in Shape C or D.
      let src = "";
      try { src = fs.readFileSync(tasksPath, "utf8"); } catch {}
      const hasLegacyNoMilestoneH3 = /^###\s+D\d+-T\d+\b/m.test(src);
      const hasBareSection = /^##\s+T-\d+\b/m.test(src);
      if (hasLegacyNoMilestoneH3) {
        warnings.push(`${domain}/tasks.md uses '### D1-T1' (legacy, no milestone prefix) — parser requires '### Mxx-D1-T1' or '- [.] **Mxx-D1-T1**' form; 0 tasks read`);
      } else if (hasBareSection) {
        warnings.push(`${domain}/tasks.md uses '## T-1:' section headings — parser requires task-id shape 'Mxx-Dx-Tx' in '###' heading or '- [.] **...**' bullet; 0 tasks read`);
      } else {
        warnings.push(`${domain}/tasks.md parsed 0 tasks — no '### Mxx-Dx-Tx' heading nor '- [.] **Mxx-Dx-Tx**' bullet found`);
      }
      continue;
    }
    for (const t of tasks) {
      if (byId[t.id]) {
        warnings.push(`duplicate task id ${t.id} (domain ${domain}) — first wins`);
        continue;
      }
      byId[t.id] = t;
      nodes.push(t);
    }
  }

  // Pass 2: touch-list fallback from scope.md when task didn't declare touches
  for (const t of nodes) {
    if (t.touches !== null) continue; // explicit declaration (incl. [])
    if (!scopeCache.has(t.domain)) {
      const scopePath = path.join(domainsRoot, t.domain, "scope.md");
      scopeCache.set(t.domain, parseScopeFilesOwned(scopePath));
    }
    const fallback = scopeCache.get(t.domain);
    if (fallback && fallback.length) {
      t.touches = fallback.slice();
    } else {
      t.touches = [];
      warnings.push(`no touch-list for ${t.id}: tasks.md missing **Touches** and scope.md has no Files Owned entries — set to []`);
    }
  }

  // Pass 3: edges
  for (const t of nodes) {
    for (const d of t.deps) {
      edges.push({ from: t.id, to: d });
    }
  }

  // Pass 4: cycle detection (throws on cycle)
  detectCycle(byId);

  // Pass 5: ready mask
  const ready = [];
  for (const t of nodes) {
    if (t.status !== "pending") continue;
    let allDone = true;
    for (const d of t.deps) {
      const dep = byId[d];
      if (!dep || dep.status !== "done") {
        allDone = false;
        break;
      }
    }
    if (allDone) ready.push(t.id);
  }

  return { nodes, edges, ready, byId, warnings };
}

/**
 * Convenience: return the list of ready TaskNode objects.
 */
function getReadyTasks(graph) {
  if (!graph || !Array.isArray(graph.ready) || !graph.byId) return [];
  return graph.ready.map((id) => graph.byId[id]).filter(Boolean);
}

module.exports = {
  buildTaskGraph,
  getReadyTasks,
  TaskGraphCycleError,
  // Internals exposed for unit tests:
  _parseTasksMd: parseTasksMd,
  _parseScopeFilesOwned: parseScopeFilesOwned,
  _parseDepList: parseDepList,
  _parseFileList: parseFileList,
};
