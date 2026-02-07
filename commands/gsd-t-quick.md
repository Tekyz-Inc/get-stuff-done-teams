# GSD-T: Quick — Fast Task Execution with Contract Awareness

You are executing a small, focused task that doesn't need full phase planning. This is for bug fixes, config changes, small features, and ad-hoc work.

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

1. Identify exactly which files need to change
2. If a contract exists for the relevant interface, implement to match it
3. Make the change
4. Verify it works
5. Commit: `[quick] {description}`

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

$ARGUMENTS
