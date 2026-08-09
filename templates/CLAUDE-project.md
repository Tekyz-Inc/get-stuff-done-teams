# {PROJECT_NAME}

{ONE_LINE_WHAT_THIS_IS}

> Everything general lives in `~/.claude/CLAUDE.md` and applies here. This file
> holds only what is true of this project and nothing else.

## Rules that can never be broken

<!--
  Ticked by David from what the project already says. Nothing invented, nothing
  copied from the global file. If a rule is enforced by a hook or a gate, say so
  — the reader should know a machine is watching.

  Leave this section out entirely if none were found, and say why.
-->
{RULES}

## Where the repo misleads you

<!--
  Only where reading the code gives a confident WRONG answer — two version
  fields disagreeing, a legacy path that still looks live, a config that is not
  the one in use. Leave out if none.
-->
{MISLEADS}

## Files that are riskier than they look

<!--
  Determined by reading, never asked. A file fixed the same way five times is a
  rule nobody wrote down. Say what breaks, not just which file. Leave out if none.
-->
{DANGER_MAP}

## Where this differs from the global rules

<!-- ONLY genuine differences. An empty table means there are none — leave it out. -->

| Global default | Here | Why |
|---|---|---|
{OVERRIDES}

## Stack and commands

{STACK}

| | |
|---|---|
| Build | `{BUILD_CMD}` |
| Test | `{TEST_CMD}` |
| Expected branch | `{BRANCH}` |

## Where things are written down

| | |
|---|---|
| State and decisions | `.gsd-t/progress.md` |
| Interfaces between parts | `.gsd-t/contracts/` |
| How to reach environments | `docs/infrastructure.md` |

<!--
  Written {GENERATED_DATE} from this project's own history.

  Nothing above should carry a number that changes on its own — no version, no
  line count, no "currently in progress". Those belong in progress.md, and a
  file that repeats them is wrong within a week.

  Regenerate with /gsd-t-setup.
-->
