# GSD-T: Quick — Fast Task Execution with Contract Awareness

You are executing a small, focused task that doesn't need full phase planning. This is for bug fixes, config changes, small features, and ad-hoc work.

## Step 0: Launch via Subagent

To give this task a fresh context window and prevent compaction during consecutive quick runs, always execute via a Task subagent.

**If you are the orchestrating agent** (you received the slash command directly):
Spawn a fresh subagent using the Task tool:
```
subagent_type: general-purpose
prompt: "You are running gsd-t-quick for this request: {$ARGUMENTS}
Working directory: {current project root}
Read CLAUDE.md and .gsd-t/progress.md for project context, then execute gsd-t-quick starting at Step 1."
```
Wait for the subagent to complete. Relay its summary to the user. **Do not execute Steps 1–5 yourself.**

**If you are the spawned subagent** (your prompt says "starting at Step 1"):
Continue to Step 1 below.

## Step 1: Load Context (Fast)

Read:
1. `CLAUDE.md`
2. `.gsd-t/progress.md` (if exists)
3. `.gsd-t/contracts/` (if exists) — scan for relevant contracts

## Step 2: Scope Check

Based on $ARGUMENTS, determine:
- Which domain does this touch? (check `.gsd-t/domains/*/scope.md` if available)
- Does it cross a domain boundary?
- Does it affect any existing contract?

### If it crosses boundaries or affects contracts:
Warn the user:
"This change touches {domain-1} and {domain-2} and may affect {contract}. 
Should I proceed with quick mode or use the full execute workflow?"

### If it's within a single domain or pre-partition:
Proceed.

## Step 3: Execute

### Deviation Rules

When you encounter unexpected situations:
1. **Bug blocking progress** → Fix it, up to 3 attempts. If still blocked, add to `.gsd-t/deferred-items.md` and skip.
2. **Missing dependency clearly needed** → Add minimum required code to unblock. Note in commit.
3. **Blocker (missing file, wrong API)** → Fix blocker and continue. Log if non-trivial.
4. **Architectural change required** → STOP. Apply Destructive Action Guard. Never self-approve.

**3-attempt limit**: Stop looping after 3 failed fix attempts. Log and move on.

1. Identify exactly which files need to change
2. **Destructive Action Guard**: Check if this task involves destructive or structural changes (DROP TABLE, removing columns, deleting data, replacing architecture patterns, removing working modules, changing schema in ways that conflict with existing data). If YES → STOP and present the change to the user with what exists today, what will change, what will break, and a safe migration path. Wait for explicit approval.
3. If a contract exists for the relevant interface, implement to match it
4. Make the change — **adapt new code to existing structures**, not the other way around
5. Verify it works
6. Commit: `[quick] {description}`

## Step 4: Document Ripple (if GSD-T is active)

If `.gsd-t/progress.md` exists, assess what documentation was affected and update ALL relevant files:

### Always update:
1. **`.gsd-t/progress.md`** — Log the quick task in the Decision Log with date and description

### Check if affected:
2. **`.gsd-t/contracts/`** — Did you change an API endpoint, schema, or component interface? Update the contract
3. **Domain `scope.md`** — Did you add new files? Update the owning domain's scope
4. **Domain `constraints.md`** — Did you establish a new pattern or discover a "must not"? Add it
5. **`docs/requirements.md`** — Did this task add, change, or clarify a requirement? Update it
6. **`docs/architecture.md`** — Did this task change how components connect or data flows? Update it
7. **`docs/schema.md`** — Did this task modify the database? Update it
8. **`.gsd-t/techdebt.md`** — Did this task resolve a debt item? Mark it done. Did it reveal new debt? Add it
9. **`CLAUDE.md`** — Did this task establish a convention future work should follow? Add it

### Skip what's not affected — most quick tasks will only touch 1-2 of these.

## Step 5: Test & Verify (MANDATORY)

Quick does not mean skip testing. Before committing:

1. **Write/update tests for every new or changed code path**:
   - Unit tests: happy path + common edge cases + error cases
   - Playwright E2E specs (if UI/routes/flows/modes changed): create new specs for new functionality, update existing specs for changed behavior
   - Cover all modes/flags affected by this change
   - "No feature code without test code" applies to quick tasks too
2. **Run the FULL test suite** — not just affected tests:
   - All unit/integration tests
   - Full Playwright E2E suite (if configured)
   - Fix any failures before proceeding (up to 2 attempts)
3. **Verify against requirements**:
   - Does the change satisfy its intended requirement?
   - Did the change break any existing functionality? (the full test run catches this)
   - If a contract exists for the interface touched, does the code still match?
4. **No test framework?**: Set one up, or at minimum manually verify and document how in the commit message

$ARGUMENTS
