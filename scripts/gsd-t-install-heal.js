#!/usr/bin/env node
/**
 * gsd-t-install-heal.js
 *
 * M108 — SessionStart hook. Checks this project's install, repairs what is
 * missing, and reports anything it could not fix.
 *
 * [RULE] install-heal-repairs-before-work-starts
 * [RULE] install-heal-reports-what-it-could-not-fix
 *
 * This is NOT a fallback. A fallback continues past a failure with a worse
 * answer. This one FIXES the failure — copies the missing tool from the
 * installed package — so the session then runs with everything present. When it
 * cannot fix something it says so loudly rather than letting the session
 * proceed on a broken install.
 *
 * It also surfaces the shared repair log: if the same tool keeps going missing
 * across projects, the installer is what needs fixing, not each project.
 *
 * ─── Stdin (Claude Code SessionStart payload) ───────────────────────────────
 *   { "hook_event_name": "SessionStart", "cwd": "...", "session_id": "..." }
 *
 * ─── Output ─────────────────────────────────────────────────────────────────
 *   Prints to stdout, which Claude Code shows as session context. Silent when
 *   the install is already complete — the common case, and no news is good news.
 *
 * Zero dependencies.
 */

"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync, execFileSync } = require("child_process");

/**
 * Find the install checker. It ships beside this hook, so one place answers it.
 * Throws with what is wrong — never returns nothing as an ordinary answer.
 */
function findChecker() {
  const beside = path.join(__dirname, "..", "bin", "gsd-t-install-check.cjs");
  if (fs.existsSync(beside)) return beside;
  throw new Error(
    `The install checker is not at ${beside}, where it ships. The GSD-T install ` +
    `itself is incomplete — reinstall it.`
  );
}

function main() {
  let input = "";
  let done = false;

  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (c) => { input += c; });

  const finish = () => {
    if (done) return;
    done = true;

    // Which project is this? The payload says. Guessing with process.cwd()
    // could check — and repair — a different project than the one the session
    // is in, so an unreadable payload stops instead.
    let data;
    try {
      data = JSON.parse(input);
    } catch (e) {
      process.stdout.write(
        `[GSD-T INSTALL] Could not tell which project this session is in, so its ` +
        `install was not checked: ${e.message}\n`
      );
      process.exit(0);
    }
    const cwd = (data && typeof data.cwd === "string" && data.cwd) ? data.cwd : null;
    if (!cwd) {
      process.stdout.write(
        "[GSD-T INSTALL] The session did not say which folder it is in, so this " +
        "project's install was not checked.\n"
      );
      process.exit(0);
    }

    // Not a GSD-T project — nothing to check.
    if (!fs.existsSync(path.join(cwd, ".gsd-t"))) { process.exit(0); }

    let checker;
    try {
      checker = findChecker();
    } catch (e) {
      process.stdout.write(`[GSD-T INSTALL] ${e.message}\n`);
      process.exit(0);
    }

    const run = spawnSync(process.execPath, [checker, "--project", cwd, "--json"], {
      encoding: "utf8", timeout: 60000, maxBuffer: 8 * 1024 * 1024,
    });

    if (run.error || !run.stdout) {
      process.stdout.write(
        `[GSD-T INSTALL] The install check could not run: ${run.error ? run.error.message : "no output"}\n`
      );
      process.exit(0);
    }

    let result;
    try {
      result = JSON.parse(run.stdout);
    } catch (_) {
      process.stdout.write("[GSD-T INSTALL] The install check returned something unreadable.\n");
      process.exit(0);
    }

    const repaired = result.repaired || [];
    const unfixable = result.unrepairable || [];

    if (repaired.length) {
      process.stdout.write(
        `[GSD-T INSTALL] This project was missing ${repaired.length} tool(s). ` +
        `They have been restored from the installed package, and the session can proceed normally.\n`
      );
    }

    if (unfixable.length) {
      process.stdout.write(
        `[GSD-T INSTALL] ${unfixable.length} tool(s) could NOT be restored:\n`
      );
      for (const u of unfixable) {
        process.stdout.write(`  ${u.tool} — ${u.reason}\n`);
      }
      process.stdout.write(
        "Anything that depends on these will fail. Tell David the install is broken " +
        "before doing work that relies on them.\n"
      );
    }

    // If one tool keeps going missing across several projects, the installer is
    // the cause, not each project. Say so ONCE — repeating it every session
    // turns a real signal into noise you stop reading.
    if (repaired.length) {
      try {
        const lib = require(checker);
        const { entries } = lib.readLog();
        const suspects = lib.installerSuspects({}, entries).filter((s) => s.projects.length >= 3);
        const seenPath = path.join(os.homedir(), ".claude", "gsd-t-install-suspects-seen.json");
        let alreadyTold = [];
        if (fs.existsSync(seenPath)) {
          alreadyTold = JSON.parse(fs.readFileSync(seenPath, "utf8"));
        }
        const fresh = suspects.filter((s) => !alreadyTold.includes(s.tool));
        if (fresh.length) {
          process.stdout.write(
            "[GSD-T INSTALL] These tools have gone missing across several projects, which " +
            "points at the installer rather than any one project:\n"
          );
          for (const s of fresh.slice(0, 5)) {
            process.stdout.write(`  ${s.tool} — ${s.projects.length} projects\n`);
          }
          process.stdout.write("This is worth fixing in GSD-T itself.\n");
          fs.writeFileSync(seenPath, JSON.stringify([...alreadyTold, ...fresh.map((s) => s.tool)]));
        }
      } catch (e) {
        // The repair above already happened and is unaffected. But this is the
        // signal that tells you the INSTALLER is at fault rather than each
        // project — losing it silently is how the underlying cause stays hidden.
        process.stdout.write(
          `[GSD-T INSTALL] Repairs were made, but the cross-project pattern could ` +
          `not be read: ${e.message}\n`
        );
      }
    }

    process.exit(0);
  };

  process.stdin.on("end", finish);
  process.stdin.on("error", finish);
  const wd = setTimeout(finish, 20000);
  if (wd.unref) wd.unref();
}

if (require.main === module) main();

module.exports = { findChecker };
