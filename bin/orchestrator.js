#!/usr/bin/env node

/**
 * GSD-T Workflow Orchestrator — Base Engine
 *
 * Abstract pipeline engine that runs deterministic, multi-phase workflows.
 * Each phase: spawn Claude → measure → gate (human review) → feedback → next phase.
 *
 * Workflow definitions plug into this engine by providing:
 *   - phases: ordered list of phase names
 *   - discoverWork(projectDir): returns { [phase]: items[] }
 *   - buildPrompt(phase, items, previousResults, projectDir): returns string
 *   - measure(projectDir, phase, items, ports): returns measurements
 *   - buildQueueItem(phase, item, measurements): returns queue item object
 *   - processFeedback(projectDir, phase, items): returns { approved[], needsWork[] }
 *   - buildFixPrompt(phase, needsWork): returns string
 *   - guessPaths(phase, item): returns source path
 *   - formatSummary(phase, result): returns string for final report
 *
 * Usage:
 *   const { Orchestrator } = require("./orchestrator.js");
 *   const workflow = require("./workflows/design-build.js");
 *   new Orchestrator(workflow).run(process.argv.slice(2));
 */

const fs = require("fs");
const path = require("path");
const { execFileSync, spawn: cpSpawn } = require("child_process");

// ─── ANSI Colors ────────────────────────────────────────────────────────────

const BOLD = "\x1b[1m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const CYAN = "\x1b[36m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

// ─── Helpers (exported for workflows) ───────────────────────────────────────

function log(msg) { console.log(msg); }
function heading(msg) { log(`\n${BOLD}${msg}${RESET}\n`); }
function success(msg) { log(`${GREEN}  ✓${RESET} ${msg}`); }
function warn(msg) { log(`${YELLOW}  ⚠${RESET} ${msg}`); }
function error(msg) { log(`${RED}  ✗${RESET} ${msg}`); }
function info(msg) { log(`${CYAN}  ℹ${RESET} ${msg}`); }
function dim(msg) { log(`${DIM}    ${msg}${RESET}`); }

function ensureDir(dir) {
  try { fs.mkdirSync(dir, { recursive: true }); } catch { /* exists */ }
}

function syncSleep(ms) {
  try {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
  } catch {
    try { execFileSync("sleep", [String(ms / 1000)], { stdio: "pipe" }); } catch { /* ignore */ }
  }
}

function openBrowser(url) {
  try {
    if (process.platform === "darwin") {
      cpSpawn("open", [url], { detached: true, stdio: "ignore" }).unref();
    } else {
      cpSpawn("xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
    }
  } catch { /* user can open manually */ }
}

function isPortInUse(port) {
  try {
    execFileSync("curl", ["-sf", "-o", "/dev/null", `http://localhost:${port}`], {
      timeout: 2000, stdio: "pipe"
    });
    return true;
  } catch {
    return false;
  }
}

// ─── Orchestrator Class ────────────────────────────────────────────────────

class Orchestrator {
  /**
   * @param {object} workflow — workflow definition object
   * @param {string} workflow.name — display name (e.g., "Design Build")
   * @param {string[]} workflow.phases — ordered phase names (e.g., ["elements", "widgets", "pages"])
   * @param {object} [workflow.defaults] — default port/timeout overrides
   * @param {string} [workflow.reviewDir] — review directory relative to project (default: ".gsd-t/design-review")
   * @param {string} [workflow.stateFile] — state file relative to project
   * @param {Function} workflow.discoverWork — (projectDir) => { [phase]: items[] }
   * @param {Function} workflow.buildPrompt — (phase, items, prevResults, projectDir) => string
   * @param {Function} [workflow.measure] — (projectDir, phase, items, ports) => measurements
   * @param {Function} [workflow.buildQueueItem] — (phase, item, measurements) => queue item
   * @param {Function} [workflow.processFeedback] — (projectDir, phase, items) => { approved[], needsWork[] }
   * @param {Function} [workflow.buildFixPrompt] — (phase, needsWork) => string
   * @param {Function} [workflow.guessPaths] — (phase, item) => sourcePath
   * @param {Function} [workflow.formatSummary] — (phase, result) => string
   * @param {Function} [workflow.parseArgs] — (argv, defaults) => opts (extend base arg parsing)
   * @param {Function} [workflow.showUsage] — () => void (custom usage text)
   * @param {Function} [workflow.startServers] — (projectDir, opts) => { pids[], devPort, reviewPort }
   * @param {Function} [workflow.validate] — (projectDir) => void (pre-flight checks, may exit)
   */
  constructor(workflow) {
    this.wf = workflow;
    this.pids = [];
  }

  // ─── CLI ─────────────────────────────────────────────────────────────

  parseBaseArgs(argv) {
    const defaults = this.wf.defaults || {};
    const opts = {
      projectDir: process.cwd(),
      resume: false,
      startPhase: null,
      devPort: defaults.devPort || 5173,
      reviewPort: defaults.reviewPort || 3456,
      timeout: defaults.timeout || 600_000,
      skipMeasure: false,
    };

    for (let i = 0; i < argv.length; i++) {
      switch (argv[i]) {
        case "--resume": opts.resume = true; break;
        case "--phase":
        case "--tier": opts.startPhase = argv[++i]; break;
        case "--project": opts.projectDir = path.resolve(argv[++i]); break;
        case "--dev-port": opts.devPort = parseInt(argv[++i], 10); break;
        case "--review-port": opts.reviewPort = parseInt(argv[++i], 10); break;
        case "--timeout": opts.timeout = parseInt(argv[++i], 10) * 1000; break;
        case "--skip-measure": opts.skipMeasure = true; break;
        case "--help":
        case "-h":
          if (this.wf.showUsage) this.wf.showUsage();
          else this._showDefaultUsage();
          process.exit(0);
      }
    }

    return opts;
  }

  _showDefaultUsage() {
    log(`
${BOLD}GSD-T ${this.wf.name} Orchestrator${RESET}

${BOLD}Usage:${RESET}
  gsd-t ${this.wf.command || "orchestrate"} [options]

${BOLD}Options:${RESET}
  --resume              Resume from last saved state
  --phase <name>        Start from specific phase (${this.wf.phases.join(", ")})
  --project <dir>       Project directory (default: cwd)
  --dev-port <N>        Dev server port (default: ${this.wf.defaults?.devPort || 5173})
  --review-port <N>     Review server port (default: ${this.wf.defaults?.reviewPort || 3456})
  --timeout <sec>       Claude timeout per phase in seconds (default: 600)
  --skip-measure        Skip automated measurement (human-review only)
  --help                Show this help

${BOLD}Phases:${RESET} ${this.wf.phases.join(" → ")}
`);
  }

  // ─── Claude ──────────────────────────────────────────────────────────

  verifyClaude() {
    try {
      execFileSync("claude", ["--version"], {
        encoding: "utf8", timeout: 5000,
        stdio: ["pipe", "pipe", "pipe"],
      });
      return true;
    } catch {
      error("claude CLI not found. Install with: npm install -g @anthropic-ai/claude-code");
      return false;
    }
  }

  spawnClaude(projectDir, prompt, timeout, opts = {}) {
    const start = Date.now();
    let output = "";
    let exitCode = 0;

    // Build args: -p for print mode, --dangerously-skip-permissions so spawned
    // Claude can write files without interactive permission prompts
    const args = ["-p", "--dangerously-skip-permissions", prompt];

    try {
      output = execFileSync("claude", args, {
        encoding: "utf8",
        timeout: timeout || this.wf.defaults?.timeout || 600_000,
        stdio: ["pipe", "pipe", "pipe"],
        cwd: projectDir,
        maxBuffer: 10 * 1024 * 1024,
      });
    } catch (e) {
      output = (e.stdout || "") + (e.stderr || "");
      exitCode = e.status || 1;
      if (e.killed) warn(`Claude timed out after ${(timeout || 600_000) / 1000}s`);
    }

    const duration = Math.round((Date.now() - start) / 1000);
    return { output, exitCode, duration };
  }

  // ─── Server Management ───────────────────────────────────────────────

  startDevServer(projectDir, port) {
    if (isPortInUse(port)) {
      success(`Dev server already running on port ${port}`);
      return { pid: null, port, alreadyRunning: true };
    }

    const pkgPath = path.join(projectDir, "package.json");
    if (!fs.existsSync(pkgPath)) {
      error("No package.json found — cannot start dev server");
      process.exit(1);
    }

    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    if (!pkg.scripts?.dev) {
      error("No 'dev' script in package.json — cannot start dev server");
      process.exit(1);
    }

    info("Starting dev server: npm run dev");
    const child = cpSpawn("npm", ["run", "dev"], {
      cwd: projectDir,
      detached: true,
      stdio: "ignore",
      env: { ...process.env, PORT: String(port) },
    });
    child.unref();

    const start = Date.now();
    const timeout = this.wf.defaults?.devServerTimeout || 30_000;
    while (Date.now() - start < timeout) {
      if (isPortInUse(port)) {
        success(`Dev server ready on port ${port} (PID: ${child.pid})`);
        return { pid: child.pid, port, alreadyRunning: false };
      }
      syncSleep(1000);
    }

    error(`Dev server failed to start within ${timeout / 1000}s`);
    process.exit(1);
  }

  startReviewServer(projectDir, devPort, reviewPort) {
    if (isPortInUse(reviewPort)) {
      success(`Review server already running on port ${reviewPort}`);
      return { pid: null, port: reviewPort, alreadyRunning: true };
    }

    const pkgRoot = path.resolve(__dirname, "..");
    const reviewScript = path.join(pkgRoot, "scripts", "gsd-t-design-review-server.js");
    if (!fs.existsSync(reviewScript)) {
      error(`Review server script not found: ${reviewScript}`);
      process.exit(1);
    }

    info(`Starting review server on port ${reviewPort}`);
    const child = cpSpawn("node", [
      reviewScript,
      "--port", String(reviewPort),
      "--target", `http://localhost:${devPort}`,
      "--project", projectDir,
    ], {
      cwd: projectDir,
      detached: true,
      stdio: "ignore",
    });
    child.unref();

    const start = Date.now();
    while (Date.now() - start < 10_000) {
      if (isPortInUse(reviewPort)) {
        success(`Review server ready on port ${reviewPort} (PID: ${child.pid})`);
        return { pid: child.pid, port: reviewPort, alreadyRunning: false };
      }
      syncSleep(1000);
    }

    error("Review server failed to start within 10s");
    process.exit(1);
  }

  // ─── Review Queue ────────────────────────────────────────────────────

  getReviewDir(projectDir) {
    return path.join(projectDir, this.wf.reviewDir || ".gsd-t/design-review");
  }

  writeQueueItem(projectDir, item) {
    const queueDir = path.join(this.getReviewDir(projectDir), "queue");
    ensureDir(queueDir);
    fs.writeFileSync(path.join(queueDir, `${item.id}.json`), JSON.stringify(item, null, 2));
  }

  clearQueue(projectDir) {
    const reviewDir = this.getReviewDir(projectDir);
    for (const sub of ["queue", "feedback", "rejected"]) {
      const dir = path.join(reviewDir, sub);
      if (fs.existsSync(dir)) {
        for (const f of fs.readdirSync(dir)) {
          try { fs.unlinkSync(path.join(dir, f)); } catch { /* ignore */ }
        }
      }
    }
    // Remove review-complete signal
    try { fs.unlinkSync(path.join(reviewDir, "review-complete.json")); } catch { /* ignore */ }
  }

  updateStatus(projectDir, phase, state) {
    const statusPath = path.join(this.getReviewDir(projectDir), "status.json");
    fs.writeFileSync(statusPath, JSON.stringify({
      phase,
      state,
      startedAt: new Date().toISOString(),
    }, null, 2));
  }

  queuePhaseItems(projectDir, phase, items, measurements) {
    this.clearQueue(projectDir);
    let order = 1;

    for (const item of items) {
      const queueItem = this.wf.buildQueueItem
        ? this.wf.buildQueueItem(phase, item, measurements)
        : this._defaultQueueItem(phase, item, measurements, order);
      queueItem.order = order++;
      this.writeQueueItem(projectDir, queueItem);
    }

    this.updateStatus(projectDir, phase, "review");
    return order - 1;
  }

  _defaultQueueItem(phase, item, measurements, order) {
    return {
      id: `${phase}-${item.id}`,
      name: item.name || item.id,
      type: phase,
      order,
      selector: item.selector || `.${item.id}`,
      sourcePath: item.sourcePath || "",
      route: item.route || "/",
      measurements: (measurements && measurements[item.id]) || [],
    };
  }

  // ─── Review Gate ─────────────────────────────────────────────────────

  waitForReview(projectDir, phase, queueCount, reviewPort) {
    const signalPath = path.join(this.getReviewDir(projectDir), "review-complete.json");

    heading(`⏸  Waiting for human review of ${phase}`);
    log(`  ${queueCount} items queued for review`);
    log(`  ${BOLD}Review UI:${RESET} http://localhost:${reviewPort}/review`);
    log(`  ${DIM}Submit your review in the browser to continue...${RESET}`);
    log("");

    openBrowser(`http://localhost:${reviewPort}/review`);

    // IRONCLAD GATE — JavaScript polling loop
    while (true) {
      if (fs.existsSync(signalPath)) {
        try {
          const data = JSON.parse(fs.readFileSync(signalPath, "utf8"));
          success("Review submitted!");
          return data;
        } catch { /* malformed — wait for rewrite */ }
      }
      syncSleep(3000);
    }
  }

  // ─── Feedback ────────────────────────────────────────────────────────

  defaultProcessFeedback(projectDir, phase, items) {
    const fbDir = path.join(this.getReviewDir(projectDir), "feedback");
    const approved = [];
    const needsWork = [];

    if (!fs.existsSync(fbDir)) {
      return { approved: items.map(c => c.id), needsWork: [] };
    }

    const fbFiles = fs.readdirSync(fbDir).filter(f => f.endsWith(".json"));

    for (const f of fbFiles) {
      try {
        const fb = JSON.parse(fs.readFileSync(path.join(fbDir, f), "utf8"));
        if (fb.verdict === "approved" || (!fb.changes?.length && !fb.comment)) {
          approved.push(fb.id);
        } else {
          needsWork.push(fb);
        }
      } catch { /* skip malformed */ }
    }

    // Items without feedback are approved by default
    const fbIds = new Set([...approved, ...needsWork.map(w => w.id)]);
    for (const item of items) {
      const queueId = `${phase}-${item.id}`;
      if (!fbIds.has(queueId) && !fbIds.has(item.id)) {
        approved.push(item.id);
      }
    }

    if (needsWork.length > 0) {
      warn(`${needsWork.length} items need changes`);
      for (const item of needsWork) {
        dim(`${item.id}: ${item.comment || "property changes requested"}`);
      }
    }

    return { approved, needsWork };
  }

  // ─── State Persistence ───────────────────────────────────────────────

  getStatePath(projectDir) {
    const stateFile = this.wf.stateFile || ".gsd-t/design-review/orchestrator-state.json";
    return path.join(projectDir, stateFile);
  }

  saveState(projectDir, state) {
    const statePath = this.getStatePath(projectDir);
    ensureDir(path.dirname(statePath));
    state.lastUpdated = new Date().toISOString();
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
  }

  loadState(projectDir) {
    const statePath = this.getStatePath(projectDir);
    if (!fs.existsSync(statePath)) return null;
    try {
      return JSON.parse(fs.readFileSync(statePath, "utf8"));
    } catch {
      return null;
    }
  }

  // ─── Cleanup ─────────────────────────────────────────────────────────

  cleanup(projectDir) {
    const shutdownPath = path.join(this.getReviewDir(projectDir), "shutdown.json");
    try {
      fs.writeFileSync(shutdownPath, JSON.stringify({ shutdown: true, at: new Date().toISOString() }));
    } catch { /* ignore */ }

    for (const pid of this.pids) {
      if (pid) {
        try { process.kill(pid); } catch { /* already dead */ }
        try { process.kill(-pid); } catch { /* ignore */ }
      }
    }
    dim("Servers stopped");
  }

  // ─── Main Pipeline ──────────────────────────────────────────────────

  run(argv) {
    const opts = this.wf.parseArgs
      ? this.wf.parseArgs(argv, this.parseBaseArgs.bind(this))
      : this.parseBaseArgs(argv || []);

    const { projectDir, resume, startPhase, devPort, reviewPort, skipMeasure } = opts;
    const phases = this.wf.phases;
    const maxReviewCycles = this.wf.defaults?.maxReviewCycles || 3;

    heading(`GSD-T ${this.wf.name} Orchestrator`);
    log(`  Project: ${projectDir}`);
    log(`  Ports:   dev=${devPort} review=${reviewPort}`);
    log(`  Phases:  ${phases.join(" → ")}`);
    log("");

    // 1. Verify prerequisites
    if (!this.verifyClaude()) process.exit(1);
    if (this.wf.validate) this.wf.validate(projectDir);

    // 2. Discover work items
    info("Discovering work...");
    const work = this.wf.discoverWork(projectDir);
    const counts = phases.map(p => `${p}: ${(work[p] || []).length}`).join(", ");
    success(`Found: ${counts}`);

    // 3. Load/create state
    let state;
    if (resume) {
      state = this.loadState(projectDir);
      if (state) {
        info(`Resuming from: ${state.currentPhase || "start"} (completed: ${state.completedPhases.join(", ") || "none"})`);
      } else {
        warn("No saved state found — starting fresh");
        state = this._createState();
      }
    } else {
      state = this._createState();
    }

    // 4. Start servers
    heading("Starting Infrastructure");
    if (this.wf.startServers) {
      const serverInfo = this.wf.startServers(projectDir, opts, this);
      this.pids = serverInfo.pids || [];
    } else {
      const devInfo = this.startDevServer(projectDir, devPort);
      const reviewInfo = this.startReviewServer(projectDir, devPort, reviewPort);
      this.pids = [devInfo.pid, reviewInfo.pid].filter(Boolean);
    }

    // Register cleanup on exit
    process.on("SIGINT", () => { this.cleanup(projectDir); process.exit(0); });
    process.on("SIGTERM", () => { this.cleanup(projectDir); process.exit(0); });

    // 5. Determine starting phase
    let startIdx = 0;
    if (startPhase) {
      startIdx = phases.indexOf(startPhase);
      if (startIdx < 0) {
        error(`Unknown phase: ${startPhase}. Use: ${phases.join(", ")}`);
        this.cleanup(projectDir);
        process.exit(1);
      }
    } else if (state.completedPhases.length > 0) {
      const lastCompleted = state.completedPhases[state.completedPhases.length - 1];
      startIdx = phases.indexOf(lastCompleted) + 1;
    }

    // 6. Phase loop — THE MAIN PIPELINE
    for (let i = startIdx; i < phases.length; i++) {
      const phase = phases[i];
      const items = work[phase] || [];

      if (items.length === 0) {
        info(`No ${phase} items — skipping`);
        state.completedPhases.push(phase);
        continue;
      }

      heading(`Phase ${i + 1}/${phases.length}: ${phase} (${items.length} items)`);

      state.currentPhase = phase;
      this.saveState(projectDir, state);

      // 6a. Collect results from previous phases
      const prevResults = {};
      for (let j = 0; j < i; j++) {
        const prevPhase = phases[j];
        if (state.phaseResults[prevPhase]) {
          prevResults[prevPhase] = state.phaseResults[prevPhase];
        }
      }

      // 6b. Spawn Claude for this phase
      const prompt = this.wf.buildPrompt(phase, items, prevResults, projectDir);
      log(`\n${CYAN}  ⚙${RESET} Spawning Claude to build ${items.length} ${phase}...`);
      dim(`Timeout: ${(opts.timeout || 600_000) / 1000}s`);

      const buildResult = this.spawnClaude(projectDir, prompt, opts.timeout);
      if (buildResult.exitCode === 0) {
        success(`Claude finished building ${phase} in ${buildResult.duration}s`);
      } else {
        warn(`Claude exited with code ${buildResult.exitCode} after ${buildResult.duration}s`);
      }

      // 6c. Collect built paths
      const builtPaths = items.map(item =>
        item.sourcePath || (this.wf.guessPaths ? this.wf.guessPaths(phase, item) : "")
      );

      // 6d. Measure
      let measurements = {};
      if (!skipMeasure && this.wf.measure) {
        measurements = this.wf.measure(projectDir, phase, items, { devPort, reviewPort }) || {};
      }

      // 6d.5. Automated AI review loop (Term 2 equivalent)
      // Spawns an independent reviewer Claude that compares built output against contracts.
      // If issues found → spawn fixer Claude → re-measure → re-review until clean.
      const maxAutoReviewCycles = this.wf.defaults?.maxAutoReviewCycles || 4;
      if (this.wf.buildReviewPrompt) {
        let autoReviewCycle = 0;
        let autoReviewClean = false;

        while (autoReviewCycle < maxAutoReviewCycles && !autoReviewClean) {
          autoReviewCycle++;
          heading(`Automated Review — ${phase} (cycle ${autoReviewCycle}/${maxAutoReviewCycles})`);

          // Spawn reviewer Claude — independent, no builder context
          const reviewPrompt = this.wf.buildReviewPrompt(phase, items, measurements, projectDir, { devPort, reviewPort });
          log(`\n${CYAN}  ⚙${RESET} Spawning reviewer Claude for ${phase}...`);
          const reviewTimeout = this.wf.defaults?.reviewTimeout || 300_000;
          const reviewResult = this.spawnClaude(projectDir, reviewPrompt, reviewTimeout);

          // Parse reviewer output for issues
          const issues = this.wf.parseReviewResult
            ? this.wf.parseReviewResult(reviewResult.output, phase)
            : this._parseDefaultReviewResult(reviewResult.output);

          if (reviewResult.exitCode === 0) {
            success(`Reviewer finished in ${reviewResult.duration}s`);
          } else {
            warn(`Reviewer exited with code ${reviewResult.exitCode} after ${reviewResult.duration}s`);
          }

          // Write review report
          const reportDir = path.join(this.getReviewDir(projectDir), "auto-review");
          ensureDir(reportDir);
          fs.writeFileSync(
            path.join(reportDir, `${phase}-cycle-${autoReviewCycle}.json`),
            JSON.stringify({ cycle: autoReviewCycle, issues, output: reviewResult.output.slice(0, 5000) }, null, 2)
          );

          if (issues.length === 0) {
            autoReviewClean = true;
            success(`Automated review passed — no issues found in ${phase}`);
          } else {
            warn(`Automated review found ${issues.length} issue(s) in ${phase}`);
            for (const issue of issues) {
              dim(`${issue.component || "?"}: ${issue.description || issue.reason || "issue"} [${issue.severity || "medium"}]`);
            }

            if (autoReviewCycle < maxAutoReviewCycles) {
              // Spawn fixer Claude with the issues
              const fixPrompt = this.wf.buildAutoFixPrompt
                ? this.wf.buildAutoFixPrompt(phase, issues, items, projectDir)
                : this._defaultAutoFixPrompt(phase, issues);

              log(`\n${CYAN}  ⚙${RESET} Spawning fixer Claude for ${issues.length} issue(s)...`);
              const fixResult = this.spawnClaude(projectDir, fixPrompt, opts.timeout || 600_000);
              if (fixResult.exitCode === 0) success(`Fixer finished in ${fixResult.duration}s`);
              else warn(`Fixer exited with code ${fixResult.exitCode}`);

              // Re-measure after fixes
              if (!skipMeasure && this.wf.measure) {
                measurements = this.wf.measure(projectDir, phase, items, { devPort, reviewPort }) || {};
              }
            } else {
              warn(`Max auto-review cycles reached — ${issues.length} issue(s) will go to human review`);
              // Attach unresolved issues to measurements for human visibility
              const issueFile = path.join(this.getReviewDir(projectDir), "auto-review", `${phase}-unresolved.json`);
              fs.writeFileSync(issueFile, JSON.stringify(issues, null, 2));
            }
          }
        }
      }

      // 6e. Human review cycle
      let reviewCycle = 0;
      let allApproved = false;

      while (reviewCycle < maxReviewCycles && !allApproved) {
        const queueCount = this.queuePhaseItems(projectDir, phase, items, measurements);
        this.waitForReview(projectDir, phase, queueCount, reviewPort);

        const feedback = this.wf.processFeedback
          ? this.wf.processFeedback(projectDir, phase, items)
          : this.defaultProcessFeedback(projectDir, phase, items);

        if (feedback.needsWork.length === 0) {
          allApproved = true;
          success(`All ${phase} approved!`);
        } else {
          reviewCycle++;
          if (reviewCycle < maxReviewCycles) {
            info(`Review cycle ${reviewCycle + 1}/${maxReviewCycles} — applying fixes...`);
            const fixPrompt = this.wf.buildFixPrompt
              ? this.wf.buildFixPrompt(phase, feedback.needsWork)
              : this._defaultFixPrompt(phase, feedback.needsWork);
            info(`Spawning Claude to apply ${feedback.needsWork.length} fixes...`);
            const fixResult = this.spawnClaude(projectDir, fixPrompt, opts.timeout || 600_000);
            if (fixResult.exitCode === 0) success("Fixes applied");
            else warn(`Fix attempt returned code ${fixResult.exitCode}`);
          } else {
            warn(`Max review cycles reached for ${phase} — proceeding with remaining issues`);
            allApproved = true;
          }
        }
      }

      // 6f. Record phase completion
      state.phaseResults[phase] = {
        completed: true,
        builtPaths,
        reviewCycles: reviewCycle + 1,
        completedAt: new Date().toISOString(),
      };
      state.completedPhases.push(phase);
      this.clearQueue(projectDir);
      this.saveState(projectDir, state);

      success(`${phase} phase complete`);
    }

    // 7. Cleanup & report
    heading(`${this.wf.name} Complete`);

    for (const phase of phases) {
      const result = state.phaseResults[phase];
      if (result?.completed) {
        const summary = this.wf.formatSummary
          ? this.wf.formatSummary(phase, result)
          : `${phase}: ${result.builtPaths.length} items built (${result.reviewCycles} review cycle${result.reviewCycles > 1 ? "s" : ""})`;
        success(summary);
      }
    }

    log("");
    this.cleanup(projectDir);

    // Remove state file on success
    try { fs.unlinkSync(this.getStatePath(projectDir)); } catch { /* ignore */ }

    success(this.wf.completionMessage || "All done. Run your app to verify: npm run dev");
  }

  _createState() {
    return {
      startedAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      currentPhase: null,
      completedPhases: [],
      phaseResults: {},
    };
  }

  _parseDefaultReviewResult(output) {
    // Try to parse JSON issues array from reviewer output
    // Reviewer is instructed to output JSON between markers
    const jsonMatch = output.match(/\[REVIEW_ISSUES\]([\s\S]*?)\[\/REVIEW_ISSUES\]/);
    if (jsonMatch) {
      try { return JSON.parse(jsonMatch[1].trim()); } catch { /* fall through */ }
    }
    // Fallback: look for PASS/FAIL verdict
    if (/\bGRUDGING PASS\b/i.test(output) || /\bPASS\b.*\b0 issues\b/i.test(output) || /no issues found/i.test(output)) {
      return [];
    }
    // If we see FAIL or DEVIATION keywords, extract what we can
    const issues = [];
    const deviationRegex = /(?:DEVIATION|FAIL|CRITICAL|ISSUE)[:\s—-]+(.+)/gi;
    let match;
    while ((match = deviationRegex.exec(output)) !== null) {
      issues.push({ description: match[1].trim(), severity: "medium" });
    }
    return issues;
  }

  _defaultAutoFixPrompt(phase, issues) {
    const issueList = issues.map((issue, i) =>
      `${i + 1}. [${issue.severity || "medium"}] ${issue.component || "unknown"}: ${issue.description || issue.reason || "fix needed"}`
    ).join("\n");

    return `The automated reviewer found these issues in the ${phase} components. Fix each one.

## Issues
${issueList}

## Rules
- Read the relevant design contract for each component to verify the correct values
- Fix ONLY the listed issues — do not modify other components
- After fixing, EXIT. Do not start servers or ask for review.`;
  }

  _defaultFixPrompt(phase, needsWork) {
    const fixes = needsWork.map(item => {
      const parts = [`Fix ${item.id}:`];
      if (item.changes?.length) {
        for (const c of item.changes) {
          parts.push(`  - ${c.property}: change from ${c.oldValue} to ${c.newValue} in ${c.path || "the component file"}`);
        }
      }
      if (item.comment) parts.push(`  - Additional: ${item.comment}`);
      return parts.join("\n");
    }).join("\n\n");

    return `Apply these specific fixes to ${phase} components:\n\n${fixes}\n\nApply the changes and EXIT. Do not rebuild anything else.`;
  }
}

// ─── Exports ────────────────────────────────────────────────────────────────

module.exports = {
  Orchestrator,
  // Export helpers for workflow definitions to use
  log, heading, success, warn, error, info, dim,
  ensureDir, syncSleep, openBrowser, isPortInUse,
  BOLD, GREEN, YELLOW, RED, CYAN, DIM, RESET,
};
