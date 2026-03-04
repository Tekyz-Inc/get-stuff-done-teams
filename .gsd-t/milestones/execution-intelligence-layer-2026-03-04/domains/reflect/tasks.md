# Tasks: reflect

## Summary
Creates the `gsd-t-reflect` command (on-demand retrospective from events/) and adds a distillation step to `gsd-t-complete-milestone.md` (pattern mining → propose CLAUDE.md rules, user confirms). Updates all 4 reference files to reflect the new command. When complete, GSD-T has a structured mechanism to extract learning from each milestone and propose lasting memory improvements.

## Tasks

### Task 1: Update `commands/gsd-t-complete-milestone.md` — add distillation step
- **Files**: `commands/gsd-t-complete-milestone.md` (modify)
- **Contract refs**: `.gsd-t/contracts/event-schema-contract.md` (reads events/ for pattern detection; writes distillation event)
- **Dependencies**: BLOCKED by event-stream Task 1 (needs events/ schema to know what to read)
- **Acceptance criteria**:
  - Read the FULL `commands/gsd-t-complete-milestone.md` before modifying — understand all steps
  - Insert new **Step 2.5: Distillation** between Gap Analysis Gate (Step 2) and Gather Milestone Artifacts (Step 3):
    ```
    Step 2.5: Distillation — Extract Milestone Patterns
    1. Scan .gsd-t/events/*.jsonl for events with outcome: "failure" or outcome: "learning"
    2. Group by reasoning field (similar patterns)
    3. Count groups — identify patterns with ≥ 3 occurrences within this milestone
    4. For each pattern found:
       - Formulate a concrete rule (e.g., "Always read X before modifying Y")
       - Present the proposed rule to the user: "Pattern found N times: {description}. Proposed CLAUDE.md rule: '{rule}'. Add? [y/n]"
    5. For each user-approved rule:
       - Write it to the relevant domain's constraints.md (if domain-specific) OR to CLAUDE.md
       - Write a distillation event: node ~/.claude/scripts/gsd-t-event-writer.js --type distillation --reasoning "{rule}" --outcome success
    6. If no patterns found (events/ is empty or no failures) → skip distillation, note in summary
    7. If event-writer not installed → skip distillation gracefully (|| true fallback)
    ```
  - Also update the **Step 7 Decision Log entry** format: the milestone completion entry must use `[success]` prefix
  - Step numbering: 2.5 is appropriate (same convention as 1.5 for mandatory gate insertions)
  - All existing steps (1 through current final step) numbered and behave identically

### Task 2: Create `commands/gsd-t-reflect.md`
- **Files**: `commands/gsd-t-reflect.md` (new)
- **Contract refs**: `.gsd-t/contracts/event-schema-contract.md` (what to read from events/), `.gsd-t/contracts/integration-points.md`
- **Dependencies**: BLOCKED by event-stream Task 1 (needs events/ schema)
- **Acceptance criteria**:
  - Read `commands/gsd-t-health.md` for the Step 0 self-spawn subagent pattern to replicate
  - New command file follows all command file conventions: Step 0 self-spawn (subagent), Steps 1-N in the subagent, Document Ripple section, Auto-Clear section, $ARGUMENTS terminator
  - **OBSERVABILITY LOGGING block MUST be present** (mandatory per CLAUDE.md for any command spawning a subagent)
  - Command flow:
    ```
    Step 0: Launch via subagent (observability logging + spawn)
    Step 1: Load state (CLAUDE.md, progress.md, current milestone name)
    Step 2: Read events
      - Find .gsd-t/events/*.jsonl files created since milestone start date
      - If no events files found: report "No events recorded for this milestone yet."
    Step 3: Generate retrospective
      - Group events by outcome: success events, failure events, learning events
      - Identify patterns: same domain/phase failing repeatedly, tools called most, phases taking longest
      - What worked: domains/tasks with only [success] outcomes
      - What failed: domains/tasks with [failure] outcomes and the reasoning field
      - Patterns: events with ≥ 2 occurrences of the same reasoning value
    Step 4: Write retrospective
      - Create .gsd-t/retrospectives/ if missing
      - Write to .gsd-t/retrospectives/YYYY-MM-DD-{milestone-name}.md
      - Sections: ## What Worked, ## What Failed, ## Patterns Found, ## Proposed Memory Updates
    Step 5: Present proposed memory updates
      - For each pattern: "Proposed CLAUDE.md rule: '{rule}'. Add? [y/n]"
      - For each approved: append to CLAUDE.md under appropriate section
    Step 6: Document Ripple — add Decision Log entry with [learning] prefix
    ```
  - If $ARGUMENTS provided: treat as milestone name filter (reflect on a specific past milestone)
  - File is ≤ 200 lines

### Task 3: Update all 4 reference files with gsd-t-reflect
- **Files**: `README.md`, `GSD-T-README.md`, `templates/CLAUDE-global.md`, `commands/gsd-t-help.md` (all modify)
- **Contract refs**: None (documentation consistency requirement from CLAUDE.md Pre-Commit Gate)
- **Dependencies**: Requires Task 2 (gsd-t-reflect.md must exist before documenting it)
- **Acceptance criteria**:
  - Read EACH file completely before modifying
  - In all 4 files: update command count from 46 → 47 (43 GSD-T workflow + 4 utility)
  - In `README.md`: add `gsd-t-reflect` row to the commands table with purpose: "Generate retrospective from event stream, propose memory updates"
  - In `GSD-T-README.md`: add `gsd-t-reflect` to the command reference section in alphabetical position
  - In `templates/CLAUDE-global.md`: add `gsd-t-reflect` row to the Commands Reference table
  - In `commands/gsd-t-help.md`: add `gsd-t-reflect` summary line to the command list
  - Count assertions: any "42 GSD-T" references become "43 GSD-T"; any "46 commands" become "47 commands"
  - Emoji table alignment convention respected (extra space after emoji in table cells)

## Execution Estimate
- Total tasks: 3
- Independent tasks: NONE (all blocked on event-stream Task 1 schema)
- Task 3 is blocked by Task 2 (reflect.md must exist before documenting)
- Execution order: Task 1 and Task 2 can proceed in parallel (they touch different files), Task 3 after Task 2
- Estimated checkpoints: 1 (Checkpoint 2 — after all reflect tasks complete)
