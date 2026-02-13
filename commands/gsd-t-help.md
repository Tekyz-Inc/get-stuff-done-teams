# GSD-T: Help — Command Reference

You are the GSD-T help system. List all commands with descriptions, and provide detailed help for any selected command.

## Default Behavior (no arguments)

Display the full command reference:

```
╔══════════════════════════════════════════════════════════════════════════════╗
║                           GSD-T Command Reference                            ║
╚══════════════════════════════════════════════════════════════════════════════╝

SMART ROUTER                                                           Manual
───────────────────────────────────────────────────────────────────────────────
  gsd-t               Describe what you need → auto-routes to the right command

GETTING STARTED                                                        Manual
───────────────────────────────────────────────────────────────────────────────
  prompt              Help formulate your idea before committing to a command
  brainstorm          Creative exploration, rethinking, and idea generation
  setup               Generate or restructure project CLAUDE.md
  init                Initialize GSD-T structure in current project
  init-scan-setup     Full onboarding: git + init + scan + setup in one
  project             New project → requirements → milestone roadmap
  feature             Major feature → impact analysis → milestones
  scan                Deep codebase analysis → techdebt.md

MILESTONE WORKFLOW                                          [auto] = in wave
───────────────────────────────────────────────────────────────────────────────
  milestone           Define a new milestone
  partition    [auto] Decompose milestone into domains + contracts
  discuss      [auto] Multi-perspective design exploration (always pauses)
  plan         [auto] Create atomic task lists per domain
  impact       [auto] Analyze downstream effects before execution
  execute      [auto] Run tasks (solo or team mode)
  test-sync    [auto] Sync tests with code changes
  integrate    [auto] Wire domains together at boundaries
  verify       [auto] Run quality gates
  complete-milestone [auto] Archive milestone + git tag

AUTOMATION                                                                Auto
───────────────────────────────────────────────────────────────────────────────
  wave                Full cycle: partition → ... → complete (auto-advances)

UTILITIES                                                              Manual
───────────────────────────────────────────────────────────────────────────────
  status              Cross-domain progress view
  resume              Restore context after break
  quick               Fast task with GSD-T guarantees
  debug               Systematic debugging with state
  promote-debt        Convert techdebt items to milestones
  populate            Auto-populate docs from existing codebase
  version-update      Update GSD-T package to latest version
  version-update-all  Update GSD-T package + all registered projects

BACKLOG                                                                Manual
───────────────────────────────────────────────────────────────────────────────
  backlog-add         Capture item, auto-categorize, append to backlog
  backlog-list        Filtered, ordered view of backlog items
  backlog-move        Reorder items by position (priority)
  backlog-edit        Modify entry fields (title, type, app, category)
  backlog-remove      Drop item with optional reason
  backlog-promote     Refine, classify, and launch GSD-T workflow
  backlog-settings    Manage types, apps, categories, and defaults

───────────────────────────────────────────────────────────────────────────────
Type /user:gsd-t-help {command} for detailed help on any command.
Example: /user:gsd-t-help impact
╚══════════════════════════════════════════════════════════════════════════════╝
```

## With Argument (specific command)

When user provides a command name, show detailed help:

```
/user:gsd-t-help {command}
```

### Command Details Format:

```
╔══════════════════════════════════════════════════════════════════════════════╗
║  gsd-t-{command}                                                             ║
╚══════════════════════════════════════════════════════════════════════════════╝

SUMMARY
  {One-line description}

USAGE
  /user:gsd-t-{command} [arguments]

WHEN TO USE
  • {Use case 1}
  • {Use case 2}

WHAT IT DOES
  1. {Step 1}
  2. {Step 2}
  3. {Step 3}

AUTO-INVOKED
  {Yes — during {phase} | No — manual only}

FILES READ
  • {file 1}
  • {file 2}

FILES CREATED/UPDATED
  • {file 1}
  • {file 2}

EXAMPLES
  /user:gsd-t-{command}
  /user:gsd-t-{command} "with argument"

RELATED COMMANDS
  • {related 1} — {why related}
  • {related 2} — {why related}

───────────────────────────────────────────────────────────────────────────────
```

## Command Summaries

Use these when user asks for help on a specific command:

### gsd-t (smart router)
- **Summary**: Describe what you need in plain language — auto-routes to the right GSD-T command
- **Auto-invoked**: No
- **Files**: Reads `CLAUDE.md`, `.gsd-t/progress.md`
- **Use when**: You don't want to remember which command to use — just describe what you want
- **Examples**: `/user:gsd-t Fix the login bug`, `/user:gsd-t Add dark mode`, `/user:gsd-t Scan for tech debt`

### prompt
- **Summary**: Help formulate project/feature/milestone prompts through guided questions
- **Auto-invoked**: No
- **Files**: None (conversational only)
- **Use when**: You have a vague idea and need help articulating it

### brainstorm
- **Summary**: Creative exploration, rethinking, and idea generation
- **Auto-invoked**: No
- **Files**: Optional save to `.gsd-t/brainstorm-{date}.md`
- **Use when**: You want to explore ideas, challenge assumptions, or break out of tunnel vision
- **Modes**: Ideation, Enhancement, Rethink, Unstuck, Blue Sky

### setup
- **Summary**: Generate or restructure the project-level CLAUDE.md
- **Auto-invoked**: No
- **Creates/Updates**: `CLAUDE.md`
- **Use when**: Starting a new project, migrating from GSD, or restructuring an existing CLAUDE.md to complement the global one

### init
- **Summary**: Initialize GSD-T directory structure in current project
- **Auto-invoked**: No
- **Creates**: `.gsd-t/` directory structure, initial progress.md
- **Use when**: Starting GSD-T in a new or existing project

### init-scan-setup
- **Summary**: Full project onboarding — git + init + scan + setup in one command
- **Auto-invoked**: No
- **Creates**: `.gsd-t/` structure, `docs/`, `.gsd-t/scan/`, `.gsd-t/techdebt.md`, optimized `CLAUDE.md`
- **Use when**: Onboarding any project into GSD-T for the first time (new or existing codebase)
- **Combines**: gsd-t-init → gsd-t-scan → gsd-t-setup, plus git remote setup if needed

### project
- **Summary**: Define a complete new project with requirements and milestone roadmap
- **Auto-invoked**: No
- **Creates**: `.gsd-t/roadmap.md`, `.gsd-t/progress.md`, `docs/requirements.md`
- **Use when**: Starting a brand new application from scratch

### feature
- **Summary**: Add a major feature to existing codebase with impact analysis
- **Auto-invoked**: No
- **Creates**: Milestones in roadmap, impact analysis
- **Use when**: Adding significant new functionality to existing project

### scan
- **Summary**: Deep codebase analysis producing architecture docs and techdebt.md
- **Auto-invoked**: No
- **Creates**: `.gsd-t/scan/`, `.gsd-t/techdebt.md`
- **Use when**: Understanding an existing codebase or auditing technical debt

### milestone
- **Summary**: Define a specific deliverable milestone within a project
- **Auto-invoked**: No
- **Updates**: `.gsd-t/progress.md`, `.gsd-t/roadmap.md`
- **Use when**: Starting work on a defined chunk of functionality

### partition
- **Summary**: Decompose milestone into domains with explicit contracts
- **Auto-invoked**: Yes (in wave, after milestone)
- **Creates**: `.gsd-t/domains/*/`, `.gsd-t/contracts/`
- **Use when**: Breaking down a milestone for parallel work

### discuss
- **Summary**: Explore design decisions from multiple perspectives
- **Auto-invoked**: Yes (in wave, after partition)
- **Updates**: `.gsd-t/contracts/`, decision log
- **Use when**: Architectural decisions need exploration

### plan
- **Summary**: Create atomic task lists for each domain
- **Auto-invoked**: Yes (in wave, after discuss)
- **Creates**: `.gsd-t/domains/*/tasks.md`
- **Use when**: Ready to define specific implementation tasks

### impact
- **Summary**: Analyze downstream effects of planned changes
- **Auto-invoked**: Yes (in wave, between plan and execute)
- **Creates**: `.gsd-t/impact-report.md`
- **Use when**: Before making changes, to understand what might break

### execute
- **Summary**: Run tasks from plan, solo or with agent teams
- **Auto-invoked**: Yes (in wave, after impact)
- **Updates**: Domain tasks, progress.md, source code
- **Use when**: Ready to implement

### test-sync
- **Summary**: Keep tests aligned with code changes
- **Auto-invoked**: Yes (during execute and verify)
- **Creates**: `.gsd-t/test-coverage.md`, test tasks
- **Use when**: After code changes, to maintain test health

### integrate
- **Summary**: Wire domains together at their boundaries
- **Auto-invoked**: Yes (in wave, after execute)
- **Updates**: Contracts, integration code
- **Use when**: Domains are complete and need to work together

### verify
- **Summary**: Run quality gates across all dimensions
- **Auto-invoked**: Yes (in wave, after integrate)
- **Creates**: `.gsd-t/verify-report.md`
- **Use when**: Checking that milestone meets requirements

### complete-milestone
- **Summary**: Archive milestone documentation and create git tag
- **Auto-invoked**: Yes (in wave, after verify passes)
- **Creates**: `.gsd-t/milestones/{name}/`, git tag
- **Use when**: Milestone is done and verified

### wave
- **Summary**: Run complete cycle automatically: partition through complete
- **Auto-invoked**: No (user triggers)
- **Runs**: partition → discuss → plan → impact → execute → test-sync → integrate → verify → complete-milestone
- **Use when**: Ready to execute a full milestone hands-off

### status
- **Summary**: Show current progress across all domains
- **Auto-invoked**: No
- **Reads**: All `.gsd-t/` files
- **Use when**: Need to see where things stand

### resume
- **Summary**: Restore context and continue from where you left off
- **Auto-invoked**: No
- **Reads**: `.gsd-t/progress.md`, domain states
- **Use when**: Starting a new session on existing work

### quick
- **Summary**: Fast task execution with GSD-T guarantees (contracts, commits)
- **Auto-invoked**: No
- **Creates**: Quick task record
- **Use when**: Small tasks that don't need full planning

### debug
- **Summary**: Systematic debugging with persistent state
- **Auto-invoked**: No
- **Creates**: Debug session state
- **Use when**: Tracking down a bug methodically

### promote-debt
- **Summary**: Convert techdebt.md items into milestones
- **Auto-invoked**: No
- **Updates**: `.gsd-t/roadmap.md`, `.gsd-t/techdebt.md`
- **Use when**: Ready to address technical debt items

### populate
- **Summary**: Auto-populate all living docs from existing codebase analysis
- **Auto-invoked**: No
- **Updates**: `docs/requirements.md`, `docs/architecture.md`, `docs/workflows.md`, `docs/infrastructure.md`, `.gsd-t/progress.md`
- **Use when**: You have an existing codebase and want to fill docs with real findings instead of placeholders

### backlog-add
- **Summary**: Capture a new backlog item with auto-categorization
- **Auto-invoked**: No
- **Files**: `.gsd-t/backlog.md`, `.gsd-t/backlog-settings.md`
- **Use when**: You have an idea, bug, or improvement to capture for later

### backlog-list
- **Summary**: Display backlog with optional filtering by type, app, or category
- **Auto-invoked**: No
- **Files**: `.gsd-t/backlog.md` (read-only)
- **Use when**: Reviewing the backlog to see what's queued up

### backlog-move
- **Summary**: Reorder a backlog item to change its priority
- **Auto-invoked**: No
- **Files**: `.gsd-t/backlog.md`
- **Use when**: Reprioritizing items in the backlog

### backlog-edit
- **Summary**: Modify fields of an existing backlog entry
- **Auto-invoked**: No
- **Files**: `.gsd-t/backlog.md`, `.gsd-t/backlog-settings.md`
- **Use when**: Updating details of a captured backlog item

### backlog-remove
- **Summary**: Remove a backlog item with optional reason
- **Auto-invoked**: No
- **Files**: `.gsd-t/backlog.md`
- **Use when**: Dropping an item that's no longer relevant

### backlog-promote
- **Summary**: Refine a backlog item and launch the appropriate GSD-T workflow
- **Auto-invoked**: No
- **Files**: `.gsd-t/backlog.md`, `.gsd-t/progress.md`
- **Use when**: Ready to act on a backlog item — promotes to milestone, quick, debug, or feature

### backlog-settings
- **Summary**: Manage allowed types, apps, categories, and default settings
- **Auto-invoked**: No
- **Files**: `.gsd-t/backlog-settings.md`
- **Use when**: Customizing the classification dimensions for your project

## Unknown Command

If user asks for help on unrecognized command:

```
❓ Unknown command: {command}

Did you mean one of these?
  • {closest match 1}
  • {closest match 2}

Run /user:gsd-t-help for full command list.
```

$ARGUMENTS
