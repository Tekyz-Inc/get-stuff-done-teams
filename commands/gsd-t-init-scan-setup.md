# GSD-T: Init-Scan-Setup — Full Project Onboarding

One command to fully onboard a project into GSD-T. Combines project directory setup, git setup, `gsd-t-init`, `gsd-t-scan`, and `gsd-t-setup` into a single orchestrated flow.

Can be run from anywhere — does not require being in the project folder first.

## Step 1: Project Directory

First, ask: **"Is `{current directory name}` your project root folder?"**

- **Yes** → Stay here and continue to Step 2
- **No** → Ask: "What's the project folder name?" (or use `$ARGUMENTS` if provided)
  1. Check if the folder exists in the current directory
     - **Exists** → `cd` into it
     - **Does not exist** → Create it, then `cd` into it

If `$ARGUMENTS` includes a folder/project name, skip the question and use it directly.

All subsequent steps run from inside the project directory.

## Step 2: Git Repository Check

1. Check if the directory is inside a git repo: `git rev-parse --is-inside-work-tree`
   - **Not a git repo** → Run `git init`
2. Check for an existing remote: `git remote -v`
   - **No remote found** → Ask the user for the GitHub repository URL, then run:
     ```
     git remote add origin {url}
     ```
   - **Remote exists** → Log it and continue
3. **Pull existing code from remote** (if any):
   - Run `git fetch origin` to get remote refs
   - If the remote has commits and local is empty (or behind), run `git pull origin main` (or the default branch)
   - This ensures the scan sees the actual codebase, not an empty directory
   - If pull fails due to branch mismatch, try `git pull origin master`
   - Skip if local already has commits matching the remote

## Step 3: Initialize Project (gsd-t-init)

Execute the full init workflow (same as `/user:gsd-t-init`):

1. Create `.gsd-t/` directory structure (contracts/, domains/, progress.md, backlog.md, backlog-settings.md, token-log.md, qa-issues.md)
2. Ensure `CLAUDE.md` exists (create starter if missing, append GSD-T section if present without it)
3. Create `docs/` with all 4 living document templates (skip existing files)
4. Ensure `README.md` exists
5. **Copy project settings**:
   - First, ensure `~/.claude/settings.local` exists. If it does NOT, create it with these defaults:
     ```json
     {
       "permissions": {
         "allow": [
           "Edit",
           "Write",
           "Bash",
           "Read",
           "WebSearch",
           "WebFetch",
           "Skill"
         ]
       },
       "outputStyle": "default"
     }
     ```
     Log: "Created ~/.claude/settings.local with default permissions — update the allow list to match your security preferences."
   - Then, if `.claude/settings.local.json` does NOT already exist in the project root:
     - Create `.claude/` directory in the project root if needed
     - Copy `~/.claude/settings.local` → `.claude/settings.local.json`
   - Skip the copy silently if the target already exists
6. Map existing codebase if code exists
7. Initialize backlog with auto-derived categories
8. Register project in `~/.claude/.gsd-t-projects`

**If `.gsd-t/` already exists**: Skip init — it's already done. Log and continue to scan. Still check and copy settings.local (step 5) even if init is skipped.

## Step 4: Deep Codebase Scan (gsd-t-scan)

Execute the full scan workflow (same as `/user:gsd-t-scan`):

1. Scan across all dimensions: architecture, business rules, security, quality, contracts
2. Build `.gsd-t/techdebt.md` register
3. Cross-populate findings into living documents (docs/architecture.md, docs/workflows.md, docs/infrastructure.md, docs/requirements.md)
4. Update README.md with discovered tech stack and setup info

Always use team mode for the scan unless the codebase is trivially small (< 5 files) or teams are explicitly disabled.

**If `.gsd-t/techdebt.md` already exists**: Append new findings, don't overwrite.

## Step 5: Generate Project CLAUDE.md (gsd-t-setup)

Execute the full setup workflow (same as `/user:gsd-t-setup`):

1. Read global `~/.claude/CLAUDE.md` to understand what's already covered
2. Use scan findings + auto-detection to populate project-specific sections
3. Remove any global duplicates from the project CLAUDE.md
4. Generate and write the optimized CLAUDE.md

At Level 3: skip questions that were auto-detected — only ask what's truly unknown.
At Level 1-2: ask all targeted questions per the setup workflow.

## Step 6: Report

Present a unified summary:

```
Project Onboarded: {project name}

  Git:      {remote URL or "local only"}
  Init:     .gsd-t/ created, docs/ populated
  Scan:     {N} tech debt items ({critical} critical, {high} high, {medium} medium, {low} low)
  Setup:    CLAUDE.md generated ({N} sections)
  Registry: {registered | already registered}

Next steps:
  → Review .gsd-t/techdebt.md for critical items
  → /user:gsd-t-milestone to define your first milestone
  → /user:gsd-t-wave to run a full development cycle
```

### Autonomy Behavior

**Level 3 (Full Auto)**: Run all steps without pausing. Only stop if git remote is needed (requires user input) or if a scan reveals critical security blockers.

**Level 1-2**: Pause after each major step (init, scan, setup) for user review before continuing.

$ARGUMENTS
