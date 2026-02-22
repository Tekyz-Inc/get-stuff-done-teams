# GSD-T: Triage and Merge — Auto-Review, Merge, and Publish GitHub Branches

You are triaging unmerged GitHub branches for safety, then auto-merging, committing, and publishing those that pass all safety checks.

## Step 1: Publish Gate

Check the project's autonomy level in `CLAUDE.md`:

- **Level 3 (Full Auto / "yolo")**: Auto-publish is ON. Skip the prompt and proceed.
- **Level 1 or 2**: Ask the user before starting:
  ```
  Auto-publish after merge? This will version bump, npm publish, and deploy.
  (yes/no)
  ```
  If **no**: triage and merge only — skip version bump, npm publish, and deploy (Steps 7-8).
  If **yes**: full pipeline including publish.

Store the decision for use in Step 7.

## Step 2: Load Context

Read:
1. `CLAUDE.md` — project conventions, pre-commit gate, autonomy level
2. `.gsd-t/progress.md` — current version and state
3. `package.json` — current version number

## Step 3: Fetch and Identify Branches

```bash
git fetch --all
git branch -r --no-merged main
```

If no unmerged branches exist, report "No unmerged branches found" and stop.

## Step 4: Triage Each Branch

For each unmerged branch, collect:

1. **Commit log**: `git log main..origin/{branch} --oneline`
2. **Files changed**: `git diff main...origin/{branch} --stat`
3. **Full diff**: `git diff main...origin/{branch}` (for impact scoring)
4. **Conflict check**: `git merge --no-commit --no-ff origin/{branch}` then `git merge --abort`

### Impact Scoring

Score each branch on a 3-tier scale:

| Tier | Criteria | Action |
|------|----------|--------|
| **Auto-merge** | Docs-only, contracts-only, templates with no behavior change, < 100 lines changed, no merge conflicts, no command file behavior changes | Merge automatically |
| **Review** | Command file changes, CLI behavior changes, new files in `commands/`, template behavior changes, > 100 lines, wave/phase sequence changes | Show summary, ask user to confirm |
| **Skip** | Merge conflicts, version-sensitive changes (package.json version), breaking changes to existing interfaces | Report why, do not merge |

### Sensitive File Patterns (trigger Review tier)

- `commands/*.md` — command behavior
- `bin/gsd-t.js` — CLI installer
- `templates/CLAUDE-global.md` — global config template
- `scripts/*.js` — hook scripts
- `package.json` — version/dependencies

### Safe File Patterns (stay in Auto-merge tier)

- `.gsd-t/contracts/*.md` — contract definitions
- `.gsd-t/techdebt.md` — debt tracking
- `docs/*.md` — documentation
- `examples/**` — example files
- `*.md` in root (except README.md with structural changes)

## Step 5: Report Triage Results

Display a summary table:

```
╔══════════════════════════════════════════════════════════════════════════════╗
║                         Branch Triage Results                               ║
╠══════════════════════════════════════════════════════════════════════════════╣

  AUTO-MERGE
  ──────────
  ✓ {branch-name} — {commit count} commits, {lines} lines, {description}

  NEEDS REVIEW
  ────────────
  ? {branch-name} — {commit count} commits, {lines} lines, {reason for review}

  SKIPPED
  ───────
  ✗ {branch-name} — {reason} (conflicts / breaking changes)

╚══════════════════════════════════════════════════════════════════════════════╝
```

## Step 6: Merge Safe Branches

For each Auto-merge branch:
1. `git merge origin/{branch} --no-edit`
2. Verify merge succeeded
3. Log the merge

For each Review branch:
1. Show the diff summary and reason it needs review
2. Ask: "Merge {branch}? (yes/no)"
3. If yes, merge it

If ALL branches were skipped (none merged), report why and stop.

## Step 7: Version Bump and Publish

**If publish gate is OFF** (user declined in Step 1): Skip this step entirely. Report merged branches and stop.

After all merges complete:

1. **Determine version bump**:
   - If any merged branch adds new commands → bump minor
   - If merged branches are docs/contracts/fixes only → bump patch
   - If any merged branch has breaking changes → bump minor (breaking = major, but those should be in Review tier)

2. **Update files**:
   - `package.json` — bump version
   - `.gsd-t/progress.md` — update version + add Decision Log entry summarizing all merged branches
   - `CHANGELOG.md` — add release entry listing what each branch contributed

3. **Pre-Commit Gate**: Run the project-specific pre-commit checklist:
   - If any merged branch changed command files → update GSD-T-README.md, README.md, CLAUDE-global template, gsd-t-help
   - If any merged branch changed CLI → verify install/update/status/doctor work
   - If any merged branch changed templates → verify gsd-t-init output

4. **Commit**: `git add` changed files and commit:
   ```
   chore: version bump to v{version} for merged branch(es)
   ```

5. **Push**: `git push`

6. **Publish**: `npm publish --access public`

7. **Deploy**: Install globally and propagate:
   ```bash
   npm install -g @tekyzinc/gsd-t@{version}
   gsd-t update-all
   ```

## Step 8: Report

Display final summary:

```
Triage complete:
  Merged:    {N} branches
  Skipped:   {N} branches
  Published: v{new-version}    (or "Skipped — publish gate off")
```

## Document Ripple

After completing triage-and-merge, check if any of these need updating based on what was merged:

1. **`.gsd-t/progress.md`** — Decision Log entry (always)
2. **`CHANGELOG.md`** — Release notes (always, if publishing)
3. **`README.md`** — If merged branches changed commands or structure
4. **`docs/GSD-T-README.md`** — If merged branches changed commands or workflow
5. **`templates/CLAUDE-global.md`** — If merged branches added commands
6. **`commands/gsd-t-help.md`** — If merged branches added commands

$ARGUMENTS

## Auto-Clear

All work is committed to project files. Execute `/clear` to free the context window for the next command.
