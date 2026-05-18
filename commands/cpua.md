# CPUA — Commit, Publish, Update All

You are running the GSD-T release flow: commit pending in-tree changes, bump the version, publish to npm, tag the release, push to origin, and propagate to all registered projects.

This is a **scoped release command** — only run in the GSD-T source repo (`/Users/david/projects/GSD-T` or whichever directory hosts `package.json` with `"name": "@tekyzinc/gsd-t"`). If invoked elsewhere, abort with a clear error.

## Step 0: Verify scope

```bash
node -e "
const pkg = require('./package.json');
if (pkg.name !== '@tekyzinc/gsd-t') {
  console.error('ERROR: /cpua must be run from the GSD-T source repo. Current dir is not @tekyzinc/gsd-t.');
  process.exit(1);
}
console.log('Scope OK — releasing', pkg.name, 'v' + pkg.version);
"
```

If this exits non-zero, stop and tell the user.

## Step 1: Pre-flight checks

Before staging anything:

1. **Run the test suite.** A failing suite blocks the release. Show the result count.
   ```bash
   npm test 2>&1 | tail -10
   ```
2. **Show the pending changes** so the user can scan what's about to be committed:
   ```bash
   git status -s
   git diff --stat
   ```
3. **Decide the version bump** based on the nature of changes (semver per `~/.claude/CLAUDE.md` § Versioning):
   - **Patch** (`x.y.10` → `x.y.11`) — bug fix, doc fix, minor improvement
   - **Minor** (`x.y.zz` → `x.(y+1).10`) — new feature, new capability, behavior addition
   - **Major** (`x.y.zz` → `(x+1).0.10`) — breaking change, major rework
   - Patch numbers always ≥ 10 (per the patch-2-digit convention).
   
   If the bump is ambiguous (e.g., the changes mix bug fix + new feature), ask the user which they want; default to the higher bump if the user doesn't answer immediately.

4. **Stop if any of these are true:**
   - Test suite has failures
   - Working tree is clean (nothing to commit — tell user "nothing to release")
   - Current branch is not `main` (warn user; ask before proceeding)
   - There are unstaged changes outside the GSD-T scope (e.g., `.gsd-t/.unattended/run.log`, `.gsd-t/headless-*.log`, `.gsd-t/events/*.jsonl`) — these are runtime noise and should NOT be committed. Stage explicitly by file, never `git add -A`.

## Step 2: Stage, version-bump, and update CHANGELOG + progress.md

1. **Stage only relevant files explicitly** — `git add path1 path2 ...`. Never `git add -A` or `git add .` (would scoop up runtime logs).
2. **Bump `package.json`** version to the new value.
3. **Add a CHANGELOG entry** at the top, immediately under the header. Use this format:
   ```markdown
   ## [NEW_VERSION] - YYYY-MM-DD
   
   ### {Added|Fixed|Changed|Removed} — {one-line summary}
   
   {2-4 sentences explaining what + why. Bullet the file-level changes.}
   
   - `path/to/file`: {what changed}
   - `path/to/test`: {regression test added if applicable}
   
   {migration note if any}
   ```
   Use the live system clock for the date — pull from `[GSD-T NOW]` or `node -e "console.log(new Date().toISOString().slice(0,10))"`. Never use `currentDate`.
4. **Append a Decision Log entry** to `.gsd-t/progress.md` under `## Decision Log`. Format:
   ```
   - YYYY-MM-DD HH:MM: [tag] {summary} (vNEW_VERSION) — {what changed and why}.
   ```
   Tag is one of: `[fix]`, `[feature]`, `[refactor]`, `[docs]`, `[chore]`, `[release]`.
5. **Update `.gsd-t/progress.md` header** — bump the `## Date:` to today and `## Version:` to NEW_VERSION.
6. **Stage** the CHANGELOG and progress.md changes too.

## Step 3: Commit

```bash
git commit -m "$(cat <<'EOF'
{type}({scope}): {short summary} (v{NEW_VERSION})

{2-3 sentences explaining the change and motivation.}

- {file}: {change}
- {file}: {change}

Suite: N/N pass.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

`{type}` is `fix` | `feat` | `chore` | `docs` | `refactor` per the convention seen in `git log --oneline`. `{scope}` is a short module/area identifier (e.g., `install`, `banner`, `parallel`).

## Step 4: Tag and push

```bash
git tag v{NEW_VERSION}
git push origin main --tags
```

If push fails (auth, network, conflict), surface the error and stop — do NOT publish a version that's not in origin.

## Step 5: Publish to npm

```bash
npm publish --access public 2>&1 | tail -10
```

Verify the output shows `+ @tekyzinc/gsd-t@{NEW_VERSION}`. If publish fails:
- Auth issue → tell user to `npm login` and retry
- Version already published → version bump was wrong; redo Step 2 with a higher version
- Network → retry once, then surface the error

## Step 6: Update global install + propagate to projects

```bash
npm install -g @tekyzinc/gsd-t@{NEW_VERSION}
gsd-t update-all 2>&1 | tail -30
```

Use `npm install -g @tekyzinc/gsd-t@{NEW_VERSION}` (NOT `npm update -g`) — npm rejects update for some legacy version strings (e.g., `3.19.00` is invalid semver because of the leading-zero patch). Pinning to the exact version sidesteps this.

## Step 7: Report

Print a concise summary:

```
✅ CPUA complete — v{OLD} → v{NEW}

  Commit:    {short_sha} {commit message subject}
  Tag:       v{NEW}
  Pushed:    origin/main + tags
  npm:       @tekyzinc/gsd-t@{NEW} published
  Global:    {old global version} → v{NEW}
  Projects:  N updated, M already current

Test suite: N/N pass — zero regressions.
```

If anything failed, surface the specific step + error and tell the user what to do next.

## Behavior

- **Always interactive on the version bump decision** — unless the user pre-specified the bump in `$ARGUMENTS` (e.g., `/cpua patch` or `/cpua minor`).
- **Never `git add -A`** — explicitly stage by file. Runtime logs and event streams stay out.
- **Never amend commits** — if anything goes wrong post-commit, create a new commit. (Per global CLAUDE.md.)
- **Never skip Step 1 pre-flight** — a broken release worse than a delayed one.
- **Always use the live system clock** for CHANGELOG and progress.md dates — `[GSD-T NOW]` or `node -e "..."`.

$ARGUMENTS

## Auto-Clear

All work is committed and propagated. Execute `/clear` to free the context window for the next command.
