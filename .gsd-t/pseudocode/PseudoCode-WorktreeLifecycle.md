# Worktree Lifecycle
Every worktree and branch either reaches its target and main, or is named in a warning, so nothing is orphaned.

```text
  Someone starts a worktree with a name
    Record in the project's worktree list (the registry): its folder, what it is for, the branch it must merge into (main unless told otherwise), who started it
  A session opens in the project
    The first session inside a recorded worktree stamps itself as the owner
    Is a worktree's branch holding commits that are on no remote:
      Yes: Warn "not pushed"
    Has a worktree's branch gone unmerged for more than three days:
      Yes: Warn "unmerged since <date>"
    For each worktree no session has open
      Is its branch merged into its target, with nothing in it that would be lost:
        Yes: Remove it the way git does; the branch stays
        No, merged but a file exists only there: Keep it and name the file
    Is a branch other branches merge into (an integration branch) ahead of main:
      Yes: Warn "not on main yet"
    The session always opens; warnings never block
  Someone asks for the audit
    Clear out worktree records whose folder is gone (they hold no work)
    For every worktree, local branch and stash, report:
      merged into its target or not
      pushed or not
      uncommitted changes or not
    Flag every integration branch not merged into main
  Someone asks to remove a worktree after merging, from any session (even the one inside it)
    Is its branch merged into its target, with nothing in it that would be lost, and no other session in it:
      Yes: Remove it the way git does (never by deleting the folder); the branch stays
      No:  Keep it and say why, naming the file that would be lost
  Nothing in it would be lost when every file in the folder (tracked, new or ignored) is one of:
    rebuildable output (installed packages, the graph index, session logs, test reports)
    exactly what its last commit holds (that commit is merged, so git keeps it)
    exactly the main folder's copy at the same place
  A release runs (cpua or checkin)
    Bring the remote's copies up to date first; stop when that fails
    Push every local branch that has commits the remote does not
    Did a push fail:
      Yes: Stop the release and show git's message
    Is an integration branch ahead of main with no reason recorded:
      Yes: Stop the release and name it
```
---
## What it does today

```text
Someone starts a worktree with a name
    The worktree is created and set up
    Nothing records what it is for or where it must merge
  Nothing checks again
    Work merged into a side branch that never reaches main looks finished
    Branches that live only on this machine are never pushed
    A worktree whose folder was deleted stays registered with git and confuses the picker
```

Grew this way because the picker only answered "where should this session start"; the end of a worktree's life had no owner.

## What changes

```text
The picker writes the registry when it creates a worktree
  One new tool answers audit, finish, set and release-check
  One new session-start hook prints the warnings
  The release commands run release-check after their own push
```

## The rules
- [RULE] worktree-removed-only-by-git — removal is `git worktree remove` without force; never a folder delete.
- [RULE] removed-only-when-nothing-is-lost — merged into its target, and every file on disk is rebuildable output (a closed list David chose) or byte-identical to its last commit or the main checkout. Unmerged, unstarted, locked, missing, or another session in it → kept with the reason.
- [RULE] removal-timing — at the next session start (any folder of the project) for worktrees no session has open, or when asked by name (the asking session may be inside it). Never mid-session on its own.
- [RULE] release-fetches-first — a stale remote copy must not make work look pushed; a failed fetch halts.
- [RULE] orphan-commits-kept-on-prune — a pruned detached worktree's commits are saved under refs/gsd-t/kept/<commit id> (the commit id, never the folder name, which git may refuse as a ref name).
- [RULE] branch-named-by-full-ref — branches are passed to git as refs/heads/<name>, so a folder or tag of the same name is never read instead.
- [RULE] stale-registration-pruned — a registration whose folder is gone holds no work and is pruned on audit.
- [RULE] warnings-never-block — the session-start check only warns; a check that cannot run says so.
- [RULE] integration-branch-needs-reason — a release halts on an integration branch ahead of main with no recorded reason.
- [RULE] release-pushes-every-branch — a release pushes each local branch with commits on no remote; a failed push halts.

## What I confirmed with you
- Requirements 1–5 as written (2026-11-01). ATOS is cleaning itself up; this is prevention only.
- Removal timing (2026-11-01): never when merging mid-session; at the next session start once you've exited, or when you ask. Pushed is not required — a merged branch's commits are in main and the branch is kept.
- Rebuildable output may be discarded: installed packages, GSD-T's generated data, test reports (chosen over strict every-file, which removed none of GSD-T's 9 merged worktrees).

## Why this shape
- Objective: no branch or worktree outlives its work unnoticed.
- Reuse: the picker, the worktree list reader and the session finder in the worktree detector.
- Simplicity: one tool, one hook, one JSON file; "integration branch" is whatever the registry names as a target or marks with a reason — never guessed from a branch name.
- Risk: removal is the only destructive step; it checks every precondition itself and never forces.
- Merged means git's ancestry check or every commit already applied on the target (rebase merges); a squash merge reads as unmerged and is reported, never removed.

## Where it lives
- bin/gsd-t-worktree-lifecycle.cjs — registry, audit, finish, set, releaseCheck, CLI
- bin/gsd-t-pick-worktree.cjs — records a new worktree (--purpose, --target)
- scripts/gsd-t-worktree-check.js — session-start warnings + owner stamp
- bin/gsd-t.js — `gsd-t worktrees`, hook registrar, bin lists
- commands/cpua.md, commands/checkin.md — release-check step
- test/worktree-lifecycle.test.js
