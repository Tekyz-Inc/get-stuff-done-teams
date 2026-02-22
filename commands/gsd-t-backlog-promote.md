# GSD-T: Backlog Promote — Refine, Classify, and Launch GSD-T Workflow

You are promoting a backlog item into the GSD-T workflow. This is the bridge from a captured idea to actionable work: refine the description, classify the scope, remove it from the backlog, and hand off to the appropriate GSD-T command.

## Step 1: Load Context

Read:
1. `CLAUDE.md`
2. `.gsd-t/progress.md` (if exists)
3. `.gsd-t/backlog.md` — the backlog file

Parse $ARGUMENTS to extract:
- `<position>` — the entry number to promote

If no position is provided, show an error:
"Usage: `/user:gsd-t-backlog-promote <position>`"

## Step 2: Find and Display Entry

Find the entry at the specified position in `.gsd-t/backlog.md`.

If the position doesn't exist, show an error:
"No backlog entry at position {position}. Run `/user:gsd-t-backlog-list` to see available entries."

Display the entry to the user:
```
Promoting backlog item #{position}:

  {title}
  Type: {type} | App: {app} | Category: {category}
  Added: {date}
  {description}
```

## Step 3: Refine Description

The backlog entry has a 1-2 sentence description. Expand it into full context:

1. Read `CLAUDE.md` and relevant docs (`docs/requirements.md`, `docs/architecture.md`, `docs/workflows.md`) to understand the project context
2. Read `.gsd-t/contracts/` to understand existing domain boundaries and interfaces
3. Build a comprehensive refined description that includes:
   - **What** needs to be done (concrete deliverables)
   - **Why** it matters (business or technical motivation)
   - **Where** in the codebase it applies (affected files, modules, or domains)
   - **Constraints** or considerations (existing patterns to follow, things to avoid)

If the original description is ambiguous or could be interpreted multiple ways, ask the user clarifying questions before proceeding.

Present the refined description to the user for confirmation:
```
Refined description:
{refined description}

Does this capture the intent? (Adjust if needed, or confirm to proceed)
```

## Step 4: Classify

Based on the refined description, determine which GSD-T workflow to create:

| Classification | Criteria | Triggers |
|---------------|----------|----------|
| **Milestone** | Multi-file, multi-phase work that needs partitioning (complex feature, large refactor) | `gsd-t-milestone` |
| **Quick** | Small scope, obvious implementation, can be done in one focused session | `gsd-t-quick` |
| **Debug** | Specific broken behavior that needs diagnosis and fix | `gsd-t-debug` |
| **Feature** | Significant new capability that needs impact assessment first | `gsd-t-feature` |

Present the classification to the user with rationale:
```
Classification: {classification}

Rationale: {why this classification fits}

If you disagree, tell me the correct classification and I'll adjust.
```

Wait for user confirmation or override before proceeding.

## Step 5: Remove from Backlog

After classification is confirmed:

1. Remove the entry at position {position} from `.gsd-t/backlog.md`
2. Renumber all remaining entries sequentially (1, 2, 3...)
3. Preserve all other entry content exactly as-is

## Step 6: Launch Workflow

Based on the classification, present the command for the user to invoke:

- **Milestone**: "Run `/user:gsd-t-milestone {refined description}`"
- **Quick**: "Run `/user:gsd-t-quick {refined description}`"
- **Debug**: "Run `/user:gsd-t-debug {refined description}`"
- **Feature**: "Run `/user:gsd-t-feature {refined description}`"

Display the full command with the refined description ready to copy.

## Step 7: Document Ripple

Update affected documentation:

### Always update:
1. **`.gsd-t/progress.md`** — Add to Decision Log: "{date}: Promoted backlog item #{position} '{title}' as {classification}"

### Check if affected:
2. **`docs/requirements.md`** — If the promoted item implies a new requirement, note it
3. **`.gsd-t/techdebt.md`** — If this was a debt item being promoted, cross-reference it

### Skip what's not affected.

## Step 8: Test Verification

Verify the backlog file is well-formed after removal and renumbering:

1. **Check format**: Confirm `.gsd-t/backlog.md` follows the file-format-contract (sequential numbering, correct entry structure)
2. **Check integrity**: Verify no entries were lost or corrupted during renumbering
3. **Check empty state**: If all entries were removed, verify file contains only the `# Backlog` heading

$ARGUMENTS

## Auto-Clear

All work is committed to project files. Execute `/clear` to free the context window for the next command.
