# installer-integration Inventory — bin/gsd-t.js (M34 Task 1)

**File**: `/Users/david/projects/GSD-T/bin/gsd-t.js`
**Length**: 2809 lines, ~97 KB
**Task**: Read-only surgical-plan map for Tasks 2-5 (hook install, doctor check, status display, API key prompt, task-counter retirement migration).

---

## 1. `PROJECT_BIN_TOOLS` array

**Defined**: line 1563.
```js
const PROJECT_BIN_TOOLS = ["archive-progress.cjs", "log-tail.cjs", "context-budget-audit.cjs", "task-counter.cjs"];
```
Comment above (lines 1560–1562) explicitly says "adding a new tool only requires appending to this array. Use .cjs extension so they always run as CommonJS regardless of the project's package.json 'type' field."

**Consumed by**: `copyBinToolsToProject` (line 1575) — iterates the array and copies each from `PKG_ROOT/bin/{tool}` to `{projectDir}/bin/{tool}` (chmod 755, skip if identical).

**Called from**:
- `doInit` at line 1113 (as `copyBinToolsToProject(projectDir, projectName)`).
- `updateSingleProject` at line 1550 (as `const binToolsCopied = copyBinToolsToProject(projectDir, projectName)`).

**Task 5 impact**: Must REMOVE `"task-counter.cjs"` from this array AND run a one-shot migration that deletes the stale `bin/task-counter.cjs` + `.gsd-t/task-counter.json` + `.gsd-t/.task-counter` from each registered project. Migration marker: `.gsd-t/.context-meter-migration-v1` (model on `.archive-migration-v1`).

---

## 2. `copyBinToolsToProject` function

**Lines**: 1565–1604. Signature: `function copyBinToolsToProject(projectDir, projectName)`.

**Behavior**:
1. Ensure `{projectDir}/bin/` exists (mkdir recursive, returns false on failure).
2. For each tool in `PROJECT_BIN_TOOLS`: read src from `PKG_ROOT/bin/{tool}`, skip if src missing.
3. Compare file contents; skip copy if identical (treated as unchanged).
4. Otherwise `fs.copyFileSync` + `fs.chmodSync(dest, 0o755)` (chmod failures swallowed).
5. Returns `true` if any copies happened, else `false`.
6. Emits `info("{projectName} — copied {N} bin tool(s)")` on success; `warn` per-tool on failure.

**Task 5 note**: This is the natural hook point for the cleanup — either inside this function or in a parallel `cleanupRetiredBinTools(projectDir, projectName)` called from `updateSingleProject` alongside `runProgressArchiveMigration`.

---

## 3. `doInit` function

**Lines**: 1095–1118.

**Current steps (in order)**:
1. Default `projectName` to `path.basename(process.cwd())` if omitted (line 1096).
2. Validate name via `validateProjectName` (line 1098); error + return on fail.
3. Heading + blank line (lines 1104–1105).
4. `today = YYYY-MM-DD` (line 1108).
5. `initClaudeMd(projectDir, projectName, today)` — line 1110.
6. `initDocs(projectDir, projectName, today)` — line 1111 (creates `docs/` + 4 templates).
7. `initGsdtDir(projectDir, projectName, today)` — line 1112 (creates `.gsd-t/`, `contracts/`, `domains/`, `progress.md`, `backlog.md`, `backlog-settings.md`, seeds universal rules).
8. `copyBinToolsToProject(projectDir, projectName)` — line 1113.
9. `registerProject(projectDir)` — line 1115.
10. `showInitTree(projectDir)` — line 1117.

**There is NO .gitignore creation in doInit.** Task 2 must add a helper (e.g. `ensureGitignoreEntries(projectDir, entries[])`) and call it from `doInit` + `updateSingleProject` to append:
- `.gsd-t/.context-meter-state.json`
- `.gsd-t/context-meter.log`

Append-only, idempotent (check if line already present before writing).

---

## 4. `doInstall` function

**Lines**: 887–921. **Not the same as `doInit`.** `doInstall` installs the global CLI harness into `~/.claude/`; `doInit` scaffolds a project in `cwd`.

**Current steps**:
1. `isUpdate = opts.update || false` (line 888).
2. Heading `Installing|Updating GSD-T {version}` (line 889).
3. `ensureDir(COMMANDS_DIR)` — line 892.
4. `installCommands(isUpdate)` — line 894 (copies all command .md files).
5. `installGlobalClaudeMd(isUpdate)` — line 895 (merges GSD-T section into `~/.claude/CLAUDE.md`).
6. `installHeartbeat()` — line 898 (copies script + registers hooks in `~/.claude/settings.json`).
7. `installUpdateCheck()` — line 901 (SessionStart hook).
8. `installAutoRoute()` — line 904 (UserPromptSubmit hook).
9. `configureFigmaMcp()` — line 907 (via `claude mcp add`).
10. `installSharedTemplates()` — line 910 (6 design contract templates → `~/.claude/templates/`).
11. `installUtilityScripts()` — line 913 (`gsd-t-tools.js`, statusline, event-writer, dashboard).
12. `installCgc()` — line 916 (CodeGraphContext + Neo4j).
13. `saveInstalledVersion()` — line 918.
14. `showInstallSummary(...)` — line 920.

**Task 2 hook install point**: Add a new section between steps 11 (`installUtilityScripts`) and 12 (`installCgc`) — e.g. `installContextMeter()` that copies `scripts/gsd-t-context-meter.js` + deps to `~/.claude/scripts/` and registers it as a `PostToolUse` hook in `~/.claude/settings.json`. Hook install helpers to mirror: `installHeartbeat` (lines 315–343) and `configureHeartbeatHooks` (lines 345–367) are the closest templates — they already demonstrate `readSettingsJson` + atomic `JSON.stringify` write + symlink guard.

**API key prompt** (Task 2): happens here, not in `doInit`. Check `process.stdout.isTTY && process.stdin.isTTY` — if non-interactive, skip prompt silently and emit an `info(...)` telling the user to set `ANTHROPIC_API_KEY`. See §13 below for current TTY pattern (there isn't one yet — must add `readline` import).

---

## 5. `doUpdate` / `doUpdateAll` functions

### `doUpdate`
**Lines**: 945–963.
1. Read installed version, short-circuit with "already up to date" if matches.
2. Otherwise heading + `doInstall({ update: true })`.

### `doUpdateAll`
**Lines**: 1489–1512.
1. `updateGlobalCommands()` (line 1490) — lines 1514–1521, re-runs `doInstall({update:true})` if version mismatch.
2. Heading `Updating registered projects...`.
3. `getRegisteredProjects()` — line 1494. Short-circuit via `showNoProjectsHint()` if empty.
4. Loop: `updateSingleProject(projectDir, counts)` — line 1500, wrapped in try/catch.
5. `syncGlobalRules(projects)` — line 1508 (cross-project rule sync).
6. `checkProjectHealth(projects)` — line 1510 (playwright + swagger checks).
7. `showUpdateAllSummary(...)` — line 1511.

### `updateSingleProject`
**Lines**: 1534–1558. This is **the per-project update loop**:
1. Name + CLAUDE.md path.
2. Existence checks (missing dir → `counts.missing`; missing CLAUDE.md → `counts.skipped`).
3. `guardAdded = updateProjectClaudeMd(...)` — injects Destructive Action Guard.
4. `changelogCreated = createProjectChangelog(...)`.
5. `binToolsCopied = copyBinToolsToProject(...)`.
6. `archiveRan = runProgressArchiveMigration(...)` — the v1 migration template (see §10).
7. Any of the above truthy → `counts.updated++`; else `counts.skipped++` + "already up to date" info.

**Task 5 hook point**: add `const cmMigrated = runContextMeterMigration(projectDir, projectName)` alongside `archiveRan`, include in the OR chain. Also ensure `copyBinToolsToProject` no longer copies `task-counter.cjs` (it's off `PROJECT_BIN_TOOLS`) AND the new migration fn actively deletes any stale copy left over from prior versions.

---

## 6. `doDoctor` function

**Lines**: 1790–1805. Thin orchestrator:
```js
let issues = 0;
issues += checkDoctorEnvironment();   // Node, claude CLI, ~/.claude/ dir (lines 1651–1676)
issues += checkDoctorInstallation();  // commands, CLAUDE.md, settings.json, encoding (1678–1696)
issues += checkDoctorProject();       // Playwright + Swagger (1731–1753)
issues += checkDoctorCgc();           // cgc binary + neo4j container (1755–1788)
```
Final output: `"All checks passed!"` (green) or `"N issue(s) found"` (yellow).

**Sub-check helpers**:
- `checkDoctorEnvironment` — 1651–1676 — Node version, claude CLI, `~/.claude/` dir.
- `checkDoctorInstallation` — 1678–1696 — counts installed commands vs expected, calls:
  - `checkDoctorClaudeMd` — 1698–1704.
  - `checkDoctorSettings` — 1706–1714 — validates `SETTINGS_JSON` is parseable.
  - `checkDoctorEncoding` — 1716–1729 — scans command files for mojibake.
- `checkDoctorProject` — 1731–1753 — Playwright + Swagger in `cwd`.
- `checkDoctorCgc` — 1755–1788 — cgc binary + neo4j docker container + "Graph Engine (CGC)" heading.

**Pattern for adding new check**: each sub-fn returns an `issues` count (number) and emits `success`/`warn`/`error` + `info` lines directly. Some (like `checkDoctorCgc`) emit their own `heading(...)`; others are flat under the top-level heading.

**Task 3 hook point**: add `checkDoctorContextMeter()` that verifies:
- `scripts/gsd-t-context-meter.js` exists in `~/.claude/scripts/`.
- `~/.claude/settings.json` contains a `PostToolUse` hook pointing at it.
- `process.env.ANTHROPIC_API_KEY` is set (warn if missing — not a hard error).
- Project has `.gsd-t/context-meter-config.json` (if `cwd` has `.gsd-t/`).
Call it in `doDoctor` after `checkDoctorCgc` as `issues += checkDoctorContextMeter()`.

**Exit code**: `doDoctor` does NOT call `process.exit`. It just logs and returns. Main switch (line 2768) simply falls through to `checkForUpdates`. Task 3 should follow this same pattern — return an `issues` number, no process.exit.

---

## 7. `doStatus` function

**Lines**: 1145–1154. Thin orchestrator (same shape as doDoctor):
```js
heading("GSD-T Status"); log("");
if (!showStatusVersion()) return;   // short-circuit if not installed
showStatusCommands();   // 1173–1183
showStatusConfig();     // 1185–1197
showStatusTeams();      // 1199–1217
showStatusProject();    // 1219–1242
```

**Sub-displays**:
- `showStatusVersion` — 1156–1171 — installed vs PKG_VERSION, update hint.
- `showStatusCommands` — 1173–1183 — `X/Y commands installed`, missing/custom lists.
- `showStatusConfig` — 1185–1197 — existence of `~/.claude/CLAUDE.md` + GSD-T section check.
- `showStatusTeams` — 1199–1217 — `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` env in settings.json.
- `showStatusProject` — 1219–1242 — `.gsd-t/` in cwd, reads `progress.md` for Project + Status lines.

**Task 4 hook point**: add `showStatusContextMeter()` between `showStatusTeams` and `showStatusProject` (or after `showStatusProject` — both acceptable). It should:
- Read `.gsd-t/.context-meter-state.json` if in a project.
- Display `pct`, `threshold`, `timestamp`, and staleness (fresh/stale/missing).
- If missing: `info("Context meter not initialized — run in Claude Code to populate")`.
- If stale (>5 min): `warn("Context meter state is stale")`.
- If fresh: `success("Context meter: {pct}% of {modelWindowSize}")`.
- Call it from `doStatus` after the existing sub-displays, before the final `log("")`.

---

## 8. Existing `~/.claude/settings.json` handling

**Path constant**: line 31. `const SETTINGS_JSON = path.join(CLAUDE_DIR, "settings.json");`

**Reader**: `readSettingsJson()` — lines 1865–1869.
```js
function readSettingsJson() {
  if (!fs.existsSync(SETTINGS_JSON)) return null;
  try { return JSON.parse(fs.readFileSync(SETTINGS_JSON, "utf8")); }
  catch { return null; }
}
```
Returns `null` if missing OR if JSON is invalid — callers distinguish by checking `fs.existsSync(SETTINGS_JSON)` themselves (see `configureHeartbeatHooks` line 347).

**Writers** (all non-atomic — direct `fs.writeFileSync` after symlink guard):
- `configureHeartbeatHooks` — lines 361–365.
- `configureUpdateCheckHook` — lines 441–443, 454–456.
- `configureAutoRouteHook` — lines 513–518.

**There is no atomic-write pattern** (no `.tmp` + rename). Every settings.json write is a direct `fs.writeFileSync(SETTINGS_JSON, JSON.stringify(settings, null, 2))` after `isSymlink` check. **Task 2 should follow this same (non-atomic) pattern for consistency** — the `PROJECTS_FILE` + global rules writers use the atomic `.tmp.{pid}` + `renameSync` trick (see line 1478–1481) but settings.json writers do not.

**Hook registration pattern** (Task 2 model — mirror exactly):
```js
// Ensure structure
if (!settings.hooks) settings.hooks = {};
if (!settings.hooks.PostToolUse) settings.hooks.PostToolUse = [];

// Idempotency check
const already = settings.hooks.PostToolUse.some((entry) =>
  entry.hooks && entry.hooks.some((h) => h.command && h.command.includes("gsd-t-context-meter.js"))
);
if (already) { info("Context meter hook already configured"); return; }

// Add new hook (async: true for non-blocking like heartbeat, or synchronous for update-check pattern)
const cmd = `node "${scriptPath.replace(/\\/g, "\\\\")}"`;
settings.hooks.PostToolUse.push({ matcher: "", hooks: [{ type: "command", command: cmd }] });

// Write (with symlink guard)
if (!isSymlink(SETTINGS_JSON)) {
  fs.writeFileSync(SETTINGS_JSON, JSON.stringify(settings, null, 2));
  success("Context meter hook configured");
} else {
  warn("Skipping settings.json write — target is a symlink");
}
```

---

## 9. Current `task-counter` references in bin/gsd-t.js

**Exactly ONE reference** (surprisingly clean — all other wiring lives in command files and `bin/orchestrator.js`, not here):

- **Line 1563**: `const PROJECT_BIN_TOOLS = ["archive-progress.cjs", "log-tail.cjs", "context-budget-audit.cjs", "task-counter.cjs"];`

No other mentions of `task-counter`, `task_counter`, `.task-counter`, or `task-counter-config` in `bin/gsd-t.js`. Task 5's edit is therefore minimal inside this file — remove the string from the array. The migration work is a new function that deletes stale files from downstream projects.

---

## 10. Migration-marker pattern from v2.74.11 (`.archive-migration-v1`)

**Function**: `runProgressArchiveMigration` — lines 1609–1635.

**Structure to mirror exactly for Task 5**:
```js
function runProgressArchiveMigration(projectDir, projectName) {
  const progressMd = path.join(projectDir, ".gsd-t", "progress.md");
  if (!fs.existsSync(progressMd)) return false;           // 1. Required file precondition.

  const markerPath = path.join(projectDir, ".gsd-t", ".archive-migration-v1");
  if (fs.existsSync(markerPath)) return false;            // 2. Idempotency — marker means done.

  const archiveScript = path.join(projectDir, "bin", "archive-progress.cjs");
  if (!fs.existsSync(archiveScript)) return false;        // 3. Tool precondition.

  try {
    const output = execFileSync("node", [archiveScript, "--quiet"], {
      cwd: projectDir, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"],
    });
    fs.writeFileSync(                                      // 4. Write marker on success only.
      markerPath,
      `# archive-migration-v1\nApplied: ${new Date().toISOString()}\nTool: bin/archive-progress.js\n`
    );
    info(`${projectName} — progress.md Decision Log archived (one-time migration)`);
    return true;
  } catch (e) {
    warn(`${projectName} — archive migration failed: ${e.message}`);
    return false;
  }
}
```

**Called from**: `updateSingleProject` line 1551 (`const archiveRan = runProgressArchiveMigration(projectDir, projectName);`).

**Task 5 template** (`runContextMeterMigration` — name tentative, contract-free):
- **Marker**: `.gsd-t/.context-meter-migration-v1`.
- **Idempotency**: return false if marker exists.
- **Targets to clean**: `bin/task-counter.cjs`, `bin/task-counter.test.cjs` (if ever distributed), `.gsd-t/task-counter.json`, `.gsd-t/.task-counter`, `.gsd-t/task-counter-config.json`.
- Each deletion wrapped in try/catch — best-effort, never throws.
- Also appends the two `.gitignore` entries if not already present (or rely on §3's `ensureGitignoreEntries` helper — prefer the helper, keep migration focused on deletion).
- Write marker on success (even if some targets were already absent). Structure:
  ```
  # context-meter-migration-v1
  Applied: {ISO}
  Retired: bin/task-counter.cjs, .gsd-t/.task-counter, .gsd-t/task-counter-config.json
  ```
- Emit `info("{projectName} — retired task-counter (one-time migration)")` on success.
- Return `true` if ANY file was deleted OR the marker was freshly written, else `false`.
- Call from `updateSingleProject` alongside `archiveRan`. Include in the OR chain that sets `counts.updated`.

---

## 11. Color / output helpers (for Task 3 reuse)

**Lines**: 70–76.
```js
const BOLD = "\x1b[1m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const CYAN = "\x1b[36m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";
```

**Wrapped logging fns** (lines 78–95):
- `log(msg)` — plain `console.log`.
- `success(msg)` — green `✓ msg`.
- `warn(msg)` — yellow `⚠ msg`.
- `error(msg)` — red `✗ msg`.
- `info(msg)` — cyan `ℹ msg`.
- `heading(msg)` — `\n` + BOLD.
- `link(text, url)` — OSC-8 hyperlink escape.
- `versionLink(ver)` — convenience wrapper around `link(v..., CHANGELOG_URL)`.

Task 3 should use `heading("Context Meter")` as a section header, then `success`/`warn`/`info` for each check — identical to `checkDoctorCgc` (lines 1755–1788).

---

## 12. `.gitignore` handling in `doInit`

**None.** `doInit` (lines 1095–1118) does NOT create or touch `.gitignore`. No other function in `bin/gsd-t.js` matches `gitignore` either.

**Task 2 must add a new helper**. Minimal design:
```js
function ensureGitignoreEntries(projectDir, entries) {
  const gitignorePath = path.join(projectDir, ".gitignore");
  if (isSymlink(gitignorePath)) return false;
  let content = "";
  try { if (fs.existsSync(gitignorePath)) content = fs.readFileSync(gitignorePath, "utf8"); } catch { return false; }
  const existing = new Set(content.split(/\r?\n/).map(l => l.trim()).filter(Boolean));
  const toAdd = entries.filter(e => !existing.has(e));
  if (toAdd.length === 0) return false;
  const prefix = content.length > 0 && !content.endsWith("\n") ? "\n" : "";
  const block = "\n# GSD-T context meter (session state — do not commit)\n" + toAdd.join("\n") + "\n";
  try { fs.appendFileSync(gitignorePath, prefix + block); return true; }
  catch { return false; }
}
```
- Call from `doInit` after `copyBinToolsToProject` (around line 1114).
- Call from `updateSingleProject` alongside the migration (as a separate step OR folded into the migration).
- Entries: `[".gsd-t/.context-meter-state.json", ".gsd-t/context-meter.log"]`.

**Note**: `initGsdtDir` creates `.gitkeep` files in contracts/ and domains/ but that's `.gitkeep`, not `.gitignore`.

---

## 13. TTY detection pattern

**Current state**: `bin/gsd-t.js` has NO existing TTY detection. No `readline` import, no `process.stdin.isTTY` checks.

The only interactive-ish code is the `execFileSync("claude", ["mcp", "add", ...])` in `configureFigmaMcp` (line 547) which relies on claude's own TTY handling.

**Task 2 API key prompt must add**:
```js
const readline = require("readline");

async function promptApiKeyIfNeeded() {
  if (!process.stdout.isTTY || !process.stdin.isTTY) {
    info("Non-interactive shell — skipping API key prompt");
    info("Set ANTHROPIC_API_KEY in your environment to enable the context meter");
    return null;
  }
  if (process.env.ANTHROPIC_API_KEY) {
    success("ANTHROPIC_API_KEY already set in environment");
    return process.env.ANTHROPIC_API_KEY;
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question("Enter ANTHROPIC_API_KEY (or press Enter to skip): ", (answer) => {
      rl.close();
      resolve(answer.trim() || null);
    });
  });
}
```

**Key design rule (from contract)**: API key is NEVER written to config or settings.json. If the user provides one, the installer should either:
(a) echo instructions to add `export ANTHROPIC_API_KEY=...` to their shell profile, OR
(b) offer to write it to `~/.claude/.env` / `~/.zshrc` / `~/.bashrc` with explicit consent.

**Recommendation for Task 2**: Option (a) only. Do NOT touch shell profiles automatically. Display the export command after capture and move on. The hook reads `process.env[apiKeyEnvVar]` at runtime — that's the only contract boundary.

`doInstall` must be made async if the prompt is async. Alternative: use synchronous read via `readline`'s sync variant or a simple blocking `question`-style pattern — but note that `doInstall` is currently synchronous and called from `if (require.main === module)` directly, so making it async will ripple into the main switch (line 2746–2806). **Simplest path**: call `promptApiKeyIfNeeded` synchronously inline in `doInstall` via `readline` with a Promise + `await`, and make `doInstall` + `doUpdate` + the top-level switch handlers async. Or use a synchronous prompt library — but that would break the zero-dependency rule (§14).

**Recommendation**: wrap the prompt in a tiny Promise, mark `doInstall` + `doUpdate` `async`, and `.catch(...)` in the main switch. Every branch in the switch becomes `case "install": doInstall().catch(e => { error(e.message); process.exit(1); }); break;`. This is a manageable ripple — only `install`, `update`, `update-all` need touching.

---

## 14. Zero-dependency rule — require() statements

**Imports** (lines 18–22):
```js
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync, spawn: cpSpawn } = require("child_process");
const debugLedger = require(path.join(__dirname, "debug-ledger.js"));
```

**Lazy requires** (inside functions):
- Line 1359: `require("./global-sync-manager.js")`.
- Line 1371: `require("./rule-engine.js")`.
- Line 1419: `require("./global-sync-manager.js")`.
- Line 1446: `require("./global-sync-manager.js")`.
- Line 1934: `require("./graph-indexer")`.
- Line 1952: `require("./graph-store")`.
- Line 1969: `require("./graph-query")`.
- Line 2781: `require("./design-orchestrator.js")`.

**All imports are either Node built-ins or sibling files in `bin/`**. Zero external npm deps. Task 2's `readline` is a Node built-in — safe. Task 2 must NOT add any other imports.

---

## Task Summary (what Tasks 2-5 will touch in this file)

| Task | Area | Line ranges | New functions | Edits to existing |
|---|---|---|---|---|
| 2 — install hook + API key prompt + .gitignore | `doInstall` (line 887), new helpers | insert ~3 new fns before line 750 area; call-sites in 887–921 and 1095–1118 | `installContextMeter`, `configureContextMeterHook`, `promptApiKeyIfNeeded`, `ensureGitignoreEntries` | `doInstall` add new section; `doInit` call `ensureGitignoreEntries` after 1113; import `readline` at top; make install/update async |
| 3 — doctor check | `doDoctor` (line 1790) | `checkDoctorContextMeter` near line 1788 | — | `doDoctor` line 1797: `issues += checkDoctorContextMeter();` |
| 4 — status display | `doStatus` (line 1145) | `showStatusContextMeter` near line 1242 | — | `doStatus` line 1152: add call before or after `showStatusProject()` |
| 5 — task-counter retirement migration | `PROJECT_BIN_TOOLS` line 1563; new migration fn near line 1635 | `runContextMeterMigration` | `PROJECT_BIN_TOOLS`: drop `"task-counter.cjs"`; `updateSingleProject` line 1551: add `const cmMigrated = runContextMeterMigration(...)` and include in OR chain |

---

## Key discoveries affecting Task 2-5 planning

1. **Only ONE line touches `task-counter` in bin/gsd-t.js** (line 1563). The installer-side retirement is trivial; all real work is the per-project filesystem cleanup in a new migration function modeled on `runProgressArchiveMigration`.
2. **The file is already pre-wired for hook install**. `installHeartbeat` + `configureHeartbeatHooks` (lines 315–367) are near-perfect templates for the context-meter hook — same pattern (copy script → register hook in settings.json → idempotent by script name match).
3. **`doInstall` is synchronous**. Adding an interactive API key prompt will require making it async and rippling into three switch cases (`install`, `update`, `update-all`). Consider hiding the async boundary at the `promptApiKeyIfNeeded` level and making only that one helper async, OR use a synchronous stdin read via a tight `readline.question` + Promise + top-level `await` (Node ≥14.8 allows it, we target ≥16).
4. **No existing `.gitignore` helper**. A new `ensureGitignoreEntries` helper is required; it should be called from BOTH `doInit` (for new projects) AND `updateSingleProject` (for existing registered projects).
5. **Zero-dep rule holds cleanly**. Only `readline` (built-in) needs adding. No npm additions.
6. **`readSettingsJson` already handles the "missing + invalid" distinction sloppily** — callers have to re-check `fs.existsSync(SETTINGS_JSON)` to disambiguate. Task 2 should follow the existing pattern (see `configureHeartbeatHooks` line 347) rather than refactor `readSettingsJson`.
7. **Settings.json writes are non-atomic** (direct `writeFileSync`). Do not introduce atomic writes in Task 2 — be consistent with the rest of the file.
8. **`doDoctor` and `doStatus` are thin orchestrators** that sum/delegate to single-responsibility sub-fns. Tasks 3 and 4 should add a single new sub-fn each and wire it in with one line. Very low risk.
9. **No symlink guard in `doInit` for `.gitignore`** — must be added to `ensureGitignoreEntries` (use existing `isSymlink` helper at line 119).
10. **The command file retirement (`gsd-t-execute.md`, `gsd-t-wave.md`, etc.) is NOT this domain's work** — it belongs to `token-budget-replacement` per `integration-points.md` (CP3 blocks Task 5's PROJECT_BIN_TOOLS edit on token-budget-replacement's command file cleanup).
