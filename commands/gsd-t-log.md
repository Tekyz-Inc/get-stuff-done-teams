# GSD-T: Log — Sync Progress Decision Log with Recent Activity

Update `.gsd-t/progress.md` Decision Log by scanning git history for commits not yet recorded. Works on any GSD-T project.

## Step 1: Load State

Read:
1. `.gsd-t/progress.md` — current Decision Log entries
2. Note the **last entry's timestamp** — this is the cutoff; only commits after this time need processing

If `.gsd-t/progress.md` doesn't exist, inform user: "No GSD-T state found. Run `/user:gsd-t-init` first."

## Step 2: Get Recent Commits

Run: `git log --reverse --format="%ai|%s" --after="{last entry date}"`

If no cutoff exists (empty Decision Log), get the full history:
`git log --reverse --format="%ai|%s"`

## Step 3: Filter and Format

For each commit since the last logged entry:

1. **Skip** merge commits, whitespace-only changes, and commits already in the Decision Log
2. **Group** multiple commits on the same day that cover the same logical change into one entry
3. **Format** each entry:
   ```
   - YYYY-MM-DD HH:MM: {commit summary} — {brief context}
   ```
4. If the commit message includes a version tag like `(vX.Y.Z)`, append it to the entry

### What to include:
- Feature additions, bug fixes, refactors
- Config/dependency changes
- Documentation updates
- Version bumps and releases
- Any commit that modified documents, scripts, or code

### What to exclude:
- Pure merge commits with no additional context
- Commits that only change whitespace or formatting
- Entries already in the Decision Log (check by date+content match)

## Step 4: Append to Decision Log

Append the new entries chronologically at the end of the existing Decision Log section in `.gsd-t/progress.md`.

Do NOT modify or rewrite existing entries — only add new ones.

## Step 5: Report

Show a summary:

```
Progress Log Updated

  Commits scanned:  {N}
  New entries added: {M}
  Last entry:        {date and summary of most recent entry}

Decision Log now has {total} entries covering {first date} to {last date}.
```

If no new commits were found:
```
Progress Log — already up to date

  Last entry: {date and summary}
  No new commits since last log entry.
```

## Step 6: First-Time Reconstruction

If the Decision Log is empty or has fewer than 3 entries and git history has 5+ commits, offer full reconstruction:

```
The Decision Log appears sparse but this project has {N} commits.
Reconstructing full history from git...
```

Then run the full reconstruction (same as the populate command's git history reconstruction):
1. Parse all commits
2. Generate timestamped entries
3. Group by logical change
4. Mark reconstructed entries: `(Entries before {date} reconstructed from git history)`

$ARGUMENTS
