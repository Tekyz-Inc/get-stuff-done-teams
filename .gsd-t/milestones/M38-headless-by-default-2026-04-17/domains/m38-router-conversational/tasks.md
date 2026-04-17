# Tasks: m38-router-conversational (RC)

## Summary

Add intent classifier to the Smart Router (`commands/gsd.md`) to distinguish workflow vs. conversational intent. Delete the 3 standalone conversational commands (`gsd-t-prompt`, `gsd-t-brainstorm`, `gsd-t-discuss`).

## Tasks

### Task RC-T1: Read the 3 conversational commands + draft intent classifier section
- **Files**: read full `commands/gsd-t-prompt.md`, `commands/gsd-t-brainstorm.md`, `commands/gsd-t-discuss.md`; read `commands/gsd.md` (full)
- **Contract refs**: NONE (this is a router-internal change)
- **Dependencies**: BLOCKED by MR-T8 (M38-CP2 / Wave 1 complete)
- **Acceptance criteria**:
  - Scratch summary of what each of the 3 commands did + how the router will absorb its use case
  - Trigger-phrase list confirmed against the 3 deleted commands (no use case left orphan)
  - Output format `→ Conversational mode (no command spawn)` + response pattern documented in scratch

### Task RC-T2: Add intent classifier to commands/gsd.md
- **Files**: `commands/gsd.md`
- **Contract refs**: NONE
- **Dependencies**: BLOCKED by RC-T1
- **Acceptance criteria**:
  - New `## Step 2.5: Intent Classification` between existing Step 2a (continuation) and Step 2 (semantic eval)
  - Three-category model documented inline: continuation → workflow → conversational; default to conversational when ambiguous
  - Trigger-phrase list inline (matches RC-T1 scratch)
  - Output format addition to Step 3: `→ Conversational mode (no command spawn)` followed by direct response
  - Existing format guarantees preserved: continuation `→ /gsd ──▶ continue /user:gsd-t-{cmd}`, workflow `→ Routing to /user:gsd-t-{command}: {reason}`
  - Existing Step 4 (no arguments help text) updated to mention conversational mode
  - File still parses

### Task RC-T3: Delete the 3 conversational command files + update help.md entries
- **Files**: DELETE `commands/gsd-t-prompt.md`, `commands/gsd-t-brainstorm.md`, `commands/gsd-t-discuss.md`; edit `commands/gsd-t-help.md` (remove the 3 entries from summary table + detail sections)
- **Contract refs**: NONE
- **Dependencies**: BLOCKED by RC-T2 (router must absorb use cases first)
- **Acceptance criteria**:
  - The 3 `.md` files are deleted from `commands/`
  - `commands/gsd-t-help.md` no longer lists `gsd-t-prompt`, `gsd-t-brainstorm`, `gsd-t-discuss` in either the summary table or the detail sections
  - `commands/gsd-t-help.md` adds a brief note: "Conversational use cases (formerly /user:gsd-t-prompt, /user:gsd-t-brainstorm, /user:gsd-t-discuss) are now handled by the Smart Router's conversational mode — just describe what you want via /user:gsd or plain text."
  - **Coordinate with CD**: this task ONLY removes the 3 conversational entries; CD-T6 removes the 4 self-improvement entries from the same file. Use distinct sections to avoid edit collisions; if CD-T6 runs first, this task picks up after CD's edits

### Task RC-T4: Add router intent classifier tests + update filesystem.test.js count
- **Files**: NEW `test/router-intent.test.js`, edit `test/filesystem.test.js` (command count assertion)
- **Contract refs**: NONE
- **Dependencies**: BLOCKED by RC-T3
- **Acceptance criteria**:
  - `test/router-intent.test.js` covers: workflow trigger routes correctly; conversational trigger routes to no-spawn mode; ambiguous defaults to conversational; continuation precedence preserved
  - 6+ test cases
  - `test/filesystem.test.js` command count adjusted: previous count − 3 (this domain) − 4 (CD will subtract 4 more, but RC owns ITS −3 in this task; CD adjusts the −4 in CD-T8). Document in test comment which deletions are RC-owned vs CD-owned to avoid race
  - **Race-free counting**: if CD-T8 has already run when RC-T4 runs, the count assertion is `previous − 7`; if RC-T4 runs first, it's `previous − 3` and CD-T8 makes it `previous − 7`. The test should accept the EXPECTED final count, which means RC-T4 commits the −7 count assuming CD will land — and notes this in a code comment. (Acceptable because both domains land in the same milestone Wave 2 commit cycle and both must commit before VERIFY runs.)

### Task RC-T5: Test suite green + commit RC domain
- **Files**: run `npm test`; if pass, commit
- **Contract refs**: M38-CP4
- **Dependencies**: BLOCKED by RC-T1 through RC-T4
- **Acceptance criteria**:
  - `npm test` green
  - Commit message: `feat(M38-RC): smart router conversational mode + delete prompt/brainstorm/discuss`
  - Decision Log entry: "M38-CP4 reached — RC domain complete; intent classifier live; 3 conversational commands deleted"

## Execution Estimate

- Total tasks: 5
- Independent tasks within domain: 1 (T1)
- Blocked tasks within domain: 4 (T2 → T3 → T4 → T5 sequential)
- Cross-domain blockers: 1 (BLOCKED by MR-T8 / M38-CP2)
- Cross-domain coordination: T3 + CD-T6 both touch `commands/gsd-t-help.md`; T4 + CD-T8 both touch `test/filesystem.test.js` count
- Estimated checkpoints: 1 (M38-CP4)
- Parallel-safe sub-groups: NONE within domain (sequential)
- Wave 2 parallel-safe with ES + CD (with CD running last)
