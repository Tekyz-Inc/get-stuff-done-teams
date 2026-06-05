# Tech Debt - Plain English

> Non-technical companion to .gsd-t/techdebt.md (Scan #12, 181 findings). One entry per item: what it is, why it matters, a real-world analogy, plain-urgency severity. Grouped by severity.

---

## 🔴 Critical (4)

### TD-113 - Core automation scripts crash immediately when run
**What it is.** The six automation scripts that power GSD-T's main workflows claim to run in a sandboxed environment (a restricted execution box), but each one opens with a command (`require()`) that the sandbox explicitly forbids. The sandbox throws a hard error the instant the script starts.
**Why it matters.** Every major GSD-T workflow - execute, verify, scan, debug, and more - is non-functional. The system appears to accept commands but silently fails, giving no useful output or progress.
**Real-world analogy.** It is like a vending machine that accepts coins and displays "dispensing" but has its motor disconnected - the process starts, then immediately stalls with no product and no refund.
**Severity.** fix before launch

### TD-114 - Parallel task execution silently falls back to single-threaded mode
**What it is.** When GSD-T tries to run multiple tasks at the same time (fan-out), it looks for a helper file that was deliberately deleted months ago. Because the file is missing, the system catches the error quietly and runs tasks one at a time instead, with no warning to the user.
**Why it matters.** A core selling point of GSD-T is parallel execution - doing more work in less time. This bug means that capability is permanently offline. Every job runs sequentially, making every workflow slower than advertised.
**Real-world analogy.** A restaurant promises a team of chefs working simultaneously on your order, but the head chef was let go and nobody told the kitchen - so one line cook handles every dish in sequence while the table waits.
**Severity.** fix before launch

### TD-115 - Removing a code review item crashes the review server
**What it is.** The review server has a handler that lets users exclude (remove) items from the review queue (the list of items awaiting review). That handler references a variable that was never created anywhere in the code. When the handler runs, it immediately crashes with a hard error.
**Why it matters.** Any attempt to exclude an item from a review session will crash that part of the server. Users cannot dismiss or skip review items, and repeated crashes can disrupt the entire review workflow.
**Real-world analogy.** An office filing system has an "archive" button that, when pressed, looks for a cabinet that was never installed - the button causes the whole desk to tip over instead of filing anything.
**Severity.** fix before launch

### TD-116 - The unattended (background) run commands reference deleted files and do nothing
**What it is.** The commands that launch and monitor GSD-T in unattended mode (running overnight or without user supervision) call on five helper files that were removed from the system months ago. When these commands are invoked, they immediately fail because the required files are gone.
**Why it matters.** Unattended mode - the ability to kick off a long job and walk away - is completely broken. Users who rely on background automation will see failures with no useful output or progress.
**Real-world analogy.** A building's after-hours security system tries to arm itself by contacting a monitoring company that closed down last year. The system appears to arm, but nothing is actually watching.
**Severity.** fix before launch


## 🟠 High (40)

### TD-117 - The quality-check workflow crashes before running a single check
**What it is.** The verify workflow - which runs all quality gates before approving work - uses the same sandboxed environment as the other workflows and makes the same forbidden calls at line 1. The very first line of the script fails, meaning no quality checks of any kind are performed.
**Why it matters.** Code and work products cannot be verified before delivery. The verify step that is supposed to catch bugs, security issues, and incomplete work silently does nothing, creating a false sense of safety.
**Real-world analogy.** A building inspector shows up, opens their checklist app, and the app crashes on launch - so they sign off on the building without looking at anything.
**Severity.** fix soon

### TD-118 - A user-supplied ID can read or overwrite files outside its designated folder
**What it is.** When GSD-T saves state for a running agent (automated worker), it builds a file path using an ID supplied by the user or an outside system. It does not check whether that ID contains navigation characters (like `../`) that could point the file path outside the safe folder.
**Why it matters.** In a shared or automated environment (such as a CI pipeline), a maliciously crafted agent ID could cause GSD-T to read or overwrite sensitive files anywhere on the machine, not just inside the project folder.
**Real-world analogy.** A hotel key card system lets guests type their own room number. A guest types "../manager-office" and the system cuts a key for the manager's office instead of a guest room.
**Severity.** fix soon

### TD-119 - The automated debug loop exits immediately on its first action
**What it is.** When GSD-T runs a debugging session in the background (headless mode), it spawns a sub-process (child instance) to do the actual work. One of those spawn calls is missing a required flag. Without that flag, the child process exits the moment it tries to use any tool.
**Why it matters.** The debug loop - the automated fix-and-retry cycle that is supposed to resolve issues without user intervention - silently stops working after its first action. Failures go unresolved and the user is not informed.
**Real-world analogy.** A repair robot is sent into a building to fix things, but its toolbox requires a passcode that nobody gave it. It opens the toolbox, gets rejected, and shuts down - leaving the repair undone.
**Severity.** fix soon

### TD-120 - A shared, guessable database password is baked into every installation
**What it is.** The password used to secure the local graph database is a fixed string hardcoded directly in the source code. Every user who installs this feature gets the same password on their machine, and it is publicly visible in the codebase.
**Why it matters.** Any process or person with network access to the machine can connect to the database using this known password. Sensitive project data stored in the graph - code relationships, dependencies, architecture - is exposed without authentication.
**Real-world analogy.** A storage facility sets every unit's lock combination to "1234" and prints it on the front door of the building. Every unit appears locked, but anyone who reads the sign can open any unit.
**Severity.** fix soon

### TD-121 - The safety check that prevents two teams from editing the same file only checks the last team listed
**What it is.** When GSD-T prepares to run multiple work domains (teams) in parallel, it runs a check to make sure no two teams will edit the same file at the same time. A bug in the argument parser means only the last team in the list is ever checked - all earlier teams are silently dropped from the safety scan.
**Why it matters.** Parallel teams can overwrite each other's changes without any warning. Work is lost, files end up in a broken state, and the merge conflict is discovered only after the fact.
**Real-world analogy.** A construction site requires teams to sign out rooms before working in them to prevent collisions. The sign-out sheet only records the last team to write their name - all previous entries are erased - so multiple crews end up in the same room at once.
**Severity.** fix soon

### TD-122 - The worker pool that actually runs parallel jobs has no automated tests
**What it is.** The component responsible for launching and managing parallel sub-processes (the worker pool executor) has no automated tests in the main test suite. Tests existed in a side branch but were never brought into the main codebase.
**Why it matters.** Bugs in this component - such as workers that fail silently, or jobs that never finish - have no safety net. Any change to the worker pool can break parallel execution without any automated warning.
**Real-world analogy.** A factory's assembly line has quality checks for every station except the conveyor belt itself. If the belt jams or runs backwards, nobody finds out until finished products stop arriving.
**Severity.** fix soon

### TD-123 - Six helper files that commands depend on do not exist
**What it is.** Six support files are called by command scripts to do things like log token usage, estimate context budget, and check session health. None of these six files exist in the codebase or the published package. Every command that calls them fails at that step.
**Why it matters.** Features including observability logging, context health warnings, and session checks are non-functional. Commands that depend on these files either crash or silently skip those steps, giving users an incomplete or misleading experience.
**Real-world analogy.** A car's dashboard has buttons labeled "GPS", "Heated Seats", and "Backup Camera" - but none of those modules were installed at the factory. Pressing the buttons does nothing.
**Severity.** fix soon

### TD-124 - When the quality gate crashes, it reports a false pass instead of a failure
**What it is.** If the parallel test runner inside the quality gate throws an error (crashes), the gate is supposed to report a failure. Instead, a quirk in the code means an empty result list is evaluated as "all checks passed" - a vacuously true result that signals success even though nothing ran.
**Why it matters.** Broken code or failed checks are approved as if they passed. Work that should be blocked from advancing moves forward, and quality problems go undetected until much later in the process.
**Real-world analogy.** A factory's final inspection station catches fire and shuts down. Instead of halting the line, the system marks every product "passed" because it has no failed inspections on record - an empty record counts as a clean record.
**Severity.** fix soon

### TD-125 - Fallback diagram renderer always draws a placeholder instead of the real diagram
**What it is.** When the primary diagram-drawing tool is unavailable, GSD-T falls back to a secondary tool. A bug in the fallback code means it always draws the same hardcoded placeholder image (`app -> db: query`) instead of the actual diagram it was given.
**Why it matters.** Architecture and data-flow diagrams in generated reports are meaningless stubs whenever the primary tool is absent. Users and stakeholders looking at documentation see a fake diagram that tells them nothing about the real system.
**Real-world analogy.** A photocopier's main tray runs out of paper and switches to the backup tray. But the backup tray was loaded with a single test page that gets printed every time, regardless of what the original document says.
**Severity.** fix soon

### TD-126 - Database schema reader assigns every column to every table
**What it is.** When GSD-T reads a database schema file to understand the data model, it scans the entire file for column definitions instead of scoping the scan to each table in turn. As a result, every table ends up listed as containing every column from every other table in the file.
**Why it matters.** Any feature that relies on schema understanding - such as architecture diagrams, documentation generators, or impact analysis - will show wildly incorrect and duplicated data. Decisions made from this output will be based on a distorted picture of the data model.
**Real-world analogy.** A library cataloguing system scans the entire building for book titles each time it processes a single shelf, then lists every book in the building as belonging to that shelf. Every shelf appears to contain the entire library.
**Severity.** fix soon

### TD-127 - Tech-debt summary readers look for an old format that no longer exists in output files
**What it is.** Two functions that extract tech-debt counts and priorities from scan output files search for a text pattern from a previous version of GSD-T. The scan tool now writes its output in a different format, so these readers find nothing and always return empty results.
**Why it matters.** Dashboards, reports, and status views that display tech-debt counts and severity breakdowns will show zero items even when the underlying scan found dozens of issues. Stakeholders are given a false "all clear."
**Real-world analogy.** A store's inventory system was programmed to read price tags printed in red ink. The supplier switched to black ink last year. Now the system counts zero items in stock no matter how full the shelves are.
**Severity.** fix soon

### TD-128 - Every graph database query takes 10 seconds because the connection is never reused
**What it is.** Each time GSD-T queries the graph database (which maps code relationships), it starts a brand-new database server process, asks one question, and then waits the full 10-second timeout for the process to quit on its own - because database servers are designed to stay running, not exit after one query.
**Why it matters.** Any workflow that makes multiple graph queries (architecture analysis, impact assessment, dead-code detection) is dramatically slower than it should be. A task that should complete in seconds can take minutes.
**Real-world analogy.** Every time a customer wants to check their bank balance, the teller opens a new branch location, processes the one request, and then waits for that branch to shut down before serving the next customer.
**Severity.** fix soon

### TD-129 - Saving graph data is not crash-safe - a mid-write failure corrupts the index silently
**What it is.** When GSD-T writes its code graph (a map of how files, functions, and components relate to each other), it saves eight separate files one after another. If the process is interrupted mid-way - by a crash, timeout, or forced shutdown - the files are left in a mismatched state with no indication anything went wrong.
**Why it matters.** The next time any graph-dependent feature runs, it reads a partially-updated index and produces incorrect results - stale relationships, missing data, or phantom entries - without warning. Debugging the resulting errors is difficult because the corruption is silent.
**Real-world analogy.** A library is updating its card catalogue by replacing cards one drawer at a time. If the librarian goes home mid-update, half the drawers have new cards and half have old ones. Anyone using the catalogue gets a mix of accurate and outdated information with no way to tell which is which.
**Severity.** fix soon

### TD-130 - Deleting a file does not mark its entries in the graph as stale
**What it is.** The staleness check that decides whether to re-index the code graph only looks at files that currently exist on disk. If a file was deleted since the last index run, it is simply absent from the check - so the graph is never flagged as out of date, and the deleted file's entries remain in the index forever.
**Why it matters.** Functions, components, and relationships from deleted files persist in the graph indefinitely. Dead-code reports, call-chain analysis, and dependency maps include phantom entries that no longer exist, making analysis results unreliable.
**Real-world analogy.** A city directory lists every business that was ever registered. When a business closes and removes its sign, the directory is never notified - so closed businesses remain listed as active indefinitely.
**Severity.** fix soon

### TD-131 - The safety filter for code searches can be bypassed with common filename characters
**What it is.** Before running a code search, GSD-T checks that the search term (entity name) contains only safe characters. The filter allows dots, slashes, and backslashes - which means terms like `../etc/passwd` (a path traversal attack) and regex wildcards (`.` matches any character in a search pattern) pass the check.
**Why it matters.** In a shared or CI environment, an attacker could craft an entity name that searches outside the project directory or matches unintended files. The safety filter provides false confidence while leaving the search open to misuse.
**Real-world analogy.** A building's visitor sign-in system checks that visitor names contain only "letters, dots, and dashes" - then a visitor writes "Mr. ../CEO-Office" and is waved through, because dots and dashes are allowed.
**Severity.** fix soon

### TD-132 - Database queries can be injected through an unsanitized user input field
**What it is.** One code path accepts a raw database query string from the caller and runs it against the graph database without any filtering or validation. A second path inserts a user-supplied number directly into a query template without checking that it is actually a number.
**Why it matters.** Anyone who can influence those inputs - through a UI field, an API call, or a config value - can run arbitrary database commands, including ones that delete all data. This is a classic injection vulnerability (similar in concept to SQL injection).
**Real-world analogy.** A bank teller accepts handwritten withdrawal slips and processes whatever amount is written, including slips that say "withdraw all funds from every account" - because no one checks whether the slip makes sense before acting on it.
**Severity.** fix soon

### TD-133 - The review proxy scrambles compressed web pages before injecting its overlay
**What it is.** When the review server proxies pages from the development web server, it receives pages in compressed form (like a zip file). It removes the label that says the content is compressed, but never actually decompresses it before trying to modify the HTML. The result is that the injected review overlay is added to a block of garbled binary data.
**Why it matters.** The review interface - the overlay that lets reviewers annotate and interact with the UI - does not render correctly on any page that the upstream server sends in compressed form. Reviews either show broken pages or fail entirely.
**Real-world analogy.** A postal worker is asked to add a sticky note to a document inside a sealed vacuum bag. Instead of opening the bag, they slap the sticky note on the outside of the bag and seal it back up. The recipient opens the bag and finds an unmarked document plus a loose sticky note that fell off.
**Severity.** fix soon

### TD-134 - A file-naming field in the review system can be manipulated to write files anywhere on disk
**What it is.** Review queue entries include an ID field that is used directly to construct file paths when saving feedback and queue state. There is no check to ensure the ID stays within the designated folder. An ID containing `../` sequences can navigate outside the intended directory.
**Why it matters.** A malicious or malformed review item could cause the server to write files anywhere on the host machine - overwriting system files, configuration, or other projects. This is a path traversal vulnerability.
**Real-world analogy.** A hotel's digital check-in assigns guests a room number from a form they fill in themselves. A guest types "../penthouse" and the system books them into the penthouse instead of a standard room, bypassing availability and pricing checks.
**Severity.** fix soon

### TD-135 - All generated UI component prompts assume Vue 3 regardless of the actual framework
**What it is.** The design orchestrator that generates prompts for building UI components hardcodes "Vue 3 + TypeScript" in every prompt, and defaults all file paths and conventions to Vue patterns. The system correctly detects the actual framework (React, Svelte, Angular) but never uses that information when building prompts.
**Why it matters.** On any non-Vue project, the AI receives incorrect instructions and generates Vue-specific code that does not work in the actual project. Developers must manually rewrite the output, defeating the purpose of the automation.
**Real-world analogy.** A contractor's bid software auto-fills every estimate form with "Victorian-style timber framing" regardless of whether the client wants a glass office tower or a concrete warehouse. Every estimate has to be corrected by hand before it can be used.
**Severity.** fix soon

### TD-136 - The dashboard auto-start feature calls a server file that does not exist
**What it is.** The component that automatically starts the GSD-T dashboard server references a JavaScript file that is not present in the codebase. When the auto-start function is called without an explicit port setting, it immediately throws a "file not found" error.
**Why it matters.** The dashboard - which provides visibility into running tasks and progress - cannot be started automatically. Any workflow or command that relies on auto-starting the dashboard will fail at that step.
**Real-world analogy.** A smart home hub is programmed to turn on the security camera system at sunset, but the camera app was uninstalled. Every evening the hub tries to launch the app, gets an error, and the cameras stay dark.
**Severity.** fix soon

### TD-137 - The data ingestion endpoint can be overwhelmed by a large or slow sender
**What it is.** The endpoint that receives streaming data (such as token counts or event logs) accumulates all incoming bytes in memory with no size limit. A sender that streams very slowly or never stops can cause the server to consume all available memory until it crashes.
**Why it matters.** Even a local process that misbehaves (a runaway loop, a stuck pipe) can bring down the entire GSD-T server process, interrupting any work in progress and losing state.
**Real-world analogy.** A warehouse receiving dock accepts deliveries of any size with no loading-bay capacity limit. A truck that never stops unloading eventually fills the entire warehouse floor, the parking lot, and the street, blocking all other operations.
**Severity.** fix soon

### TD-138 - The WebSocket disconnect message breaks the protocol specification when the reason text is long
**What it is.** WebSocket (a real-time communication protocol used by the dashboard) has a rule that disconnect ("close") messages must be at most 125 bytes long. The code that sends these messages writes the length directly without enforcing this limit, producing malformed messages when the reason text is long.
**Why it matters.** Strict WebSocket clients (browsers, proxies, monitoring tools) will reject or drop malformed close frames, potentially causing connections to hang instead of closing cleanly. This can leave stale connections open and cause resource leaks.
**Real-world analogy.** A walkie-talkie system has a rule that sign-off messages must be 10 words or fewer. An operator sends a 30-word sign-off, and some radios that strictly enforce the rule lock up waiting for a properly formatted sign-off that never comes.
**Severity.** fix soon

### TD-139 - Token usage tracking silently does nothing because it reads the wrong columns
**What it is.** The function that updates the token usage log reads column positions based on a 12-column table format. The actual log file has 11 columns in a different order. Every update attempt reads the wrong data, finds no matching row, and exits without writing anything.
**Why it matters.** Token usage is never aggregated or attributed to tasks. Dashboards, reports, and cost tracking that depend on this data show incorrect or empty figures. The log file exists but stays perpetually stale.
**Real-world analogy.** A spreadsheet formula references column M for sales totals, but the actual sales column is column L. Every calculation returns zero, and the sales dashboard shows the company made nothing - while actual sales go unrecorded.
**Severity.** fix soon

### TD-140 - The token log file grows without bound, duplicating all rows on every update
**What it is.** The tail-mode token aggregator is supposed to append only new rows to a file as new task groups appear. Instead, it appends all current rows every time any change occurs. After ten updates, the file contains 55 rows instead of 10, with early rows repeated many times.
**Why it matters.** Token usage reports are inflated and inaccurate. Storage grows unboundedly during long workflows. Any downstream analysis of the file (cost attribution, usage trends) produces wrong results because of the duplicated data.
**Real-world analogy.** A timesheet system is supposed to add one new line per employee per day. Instead, every time a new employee clocks in, it reprints every previous employee's line again. By Friday the timesheet has hundreds of entries instead of five.
**Severity.** fix soon

### TD-141 - A typo in a pattern-matching rule causes success criteria to be missed at the end of a document
**What it is.** A regular expression (a text-matching rule) used to extract "success criteria" from milestone charter files contains `\Z`, which in JavaScript is not a special end-of-document marker but is literally the character "Z". When the success criteria section is the last section in a file, the rule fails to match it, and the criteria are silently omitted.
**Why it matters.** Context briefs generated for domain workers are missing their success criteria when those criteria appear at the end of the charter. Workers proceed without knowing the definition of done, making it harder to verify that work is complete.
**Real-world analogy.** A checklist scanner is programmed to stop reading at the word "END" or the letter "Z". Any checklist whose last item doesn't happen to contain "Z" is scanned as incomplete, and the final items are never recorded.
**Severity.** fix soon

### TD-142 - A pre-commit safety hook calls a deleted command and blocks every commit on projects that install it
**What it is.** A git pre-commit hook (a script that runs automatically before each code commit) calls a GSD-T subcommand (`capture-lint`) that was removed from the system months ago. Because the command no longer exists, it always returns an error, and the hook fails - blocking the commit entirely.
**Why it matters.** Any project that has this hook installed cannot commit any code. All developers on that project are blocked from saving their work to source control until the hook is manually disabled or fixed.
**Real-world analogy.** A building's door lock system is programmed to call a verification service before unlocking. The verification service was shut down six months ago. Now every door on the floor is permanently locked, and nobody can get in or out without bypassing the system manually.
**Severity.** fix soon

### TD-143 - The journey coverage detector assigns unstable IDs to observers, breaking coverage tracking
**What it is.** When GSD-T scans for mutation observers (components that watch for DOM changes in the UI), it increments a counter before checking whether an observer should be excluded. Excluded observers consume a counter slot without producing output, shifting the IDs of all subsequent observers. If excluded observers are added or removed later, all downstream observer IDs change.
**Why it matters.** Coverage reports become unstable - the same observer gets a different ID depending on what other observers happen to be in the file. This causes false positives ("coverage lost") and false negatives ("coverage gained") whenever the file changes.
**Real-world analogy.** A concert venue assigns seat numbers sequentially as tickets are printed, but VIP seats (which are excluded from public sale) still consume a number. When a VIP row is added or removed, every seat after it shifts by a row, and existing tickets no longer match their physical seats.
**Severity.** fix soon

### TD-144 - The E2E test helper that replays sessions crashes immediately because it loads deleted files
**What it is.** A test fixture helper used in end-to-end tests (automated tests that simulate real user flows) tries to load two server files at startup that were deleted in a previous cleanup. The moment any test calls `startReplayServer()`, it throws a "file not found" error before any test logic runs.
**Why it matters.** Any end-to-end test suite that uses `startReplayServer()` cannot run at all. This blocks automated quality checks for features that depend on session replay, and the failure is misleading because it looks like a server error rather than a missing file.
**Real-world analogy.** A flight simulator training program tries to load a co-pilot module that was removed in the last software update. Every time a trainee starts a session, the simulator crashes before they can touch any controls.
**Severity.** fix soon

### TD-145 - The model selection rules disagree with the official contract, and several phases have no rule at all
**What it is.** GSD-T has a documented contract specifying which AI model to use for each workflow phase (for example, using the most capable model for planning because a bad plan causes cascading rework). The actual code assigns the wrong model to "plan" and has no rule at all for four other phases, so they silently fall back to a default.
**Why it matters.** Planning, impact analysis, milestone completion, and scan phases run on a less capable model than the contract requires, or on whatever default happens to apply. Work quality in these high-stakes phases is lower than the system's own documented standard.
**Real-world analogy.** A hospital protocol says senior surgeons must lead high-risk procedures. The scheduling system was coded to assign any available surgeon - and nobody noticed the mismatch. High-risk operations are quietly being led by whichever surgeon is free, not the most experienced one.
**Severity.** fix soon

### TD-146 - Stack-specific coding rules are never injected into the Workflow execution system
**What it is.** GSD-T is documented to automatically detect the project's technology stack (React, TypeScript, Python, etc.) and inject relevant best-practice rules into every AI worker prompt. This injection logic exists in an older part of the system but was never wired into the new Workflow execution scripts introduced in a recent major update.
**Why it matters.** All domain workers in Workflow-based execution operate without stack-specific guardrails. React-specific, TypeScript-specific, or Python-specific rules are silently absent, increasing the likelihood of stack-inappropriate code or patterns being generated.
**Real-world analogy.** A staffing agency promises to brief temporary workers on each client's specific workplace rules before they start. When the agency switched to a new scheduling system, the briefing step was never connected to the new workflow. Workers now show up with no client-specific instructions.
**Severity.** fix soon

### TD-147 - The backlog query API always returns zero items because it reads the wrong file format
**What it is.** The function that reads and returns backlog items searches for pipe-separated table rows (an old format). The actual backlog file uses a heading-based format with no table rows. Because the format does not match, the function always returns an empty list regardless of how many items exist.
**Why it matters.** Dashboards, status commands, and brief generators that query the backlog always see it as empty. Users and automated workflows cannot get a programmatic view of outstanding work, making backlog-driven automation non-functional.
**Real-world analogy.** A grocery store's inventory app is programmed to read price tags with barcodes. The store switched to QR codes last year. The app now reports every shelf as empty because it cannot read any of the current tags.
**Severity.** fix soon

### TD-148 - Removing the default app from backlog settings silently breaks all future backlog additions
**What it is.** When a user removes an app from the backlog settings, the system warns about existing backlog entries that use that app but never checks whether the app being removed is also set as the default. After removal, any attempt to add a new backlog item without specifying an app fails immediately, with no explanation of what happened.
**Why it matters.** After this sequence of actions, new backlog items cannot be added until the user discovers and manually fixes the default app setting. There is no warning at removal time, so the root cause is non-obvious.
**Real-world analogy.** A restaurant lets managers remove menu items. A manager removes the item set as the "daily special" - but the ordering system is not notified. From then on, every time a waiter tries to ring up a daily special order, the system rejects it with a generic error.
**Severity.** fix soon

### TD-149 - Promotion System That Never Actually Promotes Anything
**What it is.** The system has a five-stage process for "graduating" improvements (patches) from experimental to permanent, but two of those stages are never triggered, so every improvement stays permanently stuck at stage one, as if you built a conveyor belt but left two sections missing.
**Why it matters.** No improvement ever gets officially applied or measured, meaning the system cannot tell which fixes are working and which are not - the entire promotion process is theater.
**Real-world analogy.** Like a job application pipeline where candidates get screened and interviewed but the "send offer letter" and "onboard" steps were never wired up, so no one ever actually gets hired.
**Severity.** Fix soon

### TD-150 - Improvements Can Never Fully Graduate Due to a Catch-22
**What it is.** To be permanently approved, an improvement needs three checkpoints recorded after it advances to the next stage - but the system stops recording checkpoints the moment it advances, so the count can never reach three.
**Why it matters.** Any improvement that was approved with the minimum required evidence will be permanently stuck just short of the finish line, meaning nothing ever fully graduates.
**Real-world analogy.** Like a loyalty card that requires 3 stamps after your 10th purchase to earn a free coffee - but the cashier's stamp stops working after your 10th visit, so the card can never be completed.
**Severity.** Fix soon

### TD-151 - The Scoring System Rewards the Wrong Direction for Half the Metrics
**What it is.** When measuring whether an improvement worked, the system always treats "higher number" as better. For metrics where lower is better (like how many times something had to be fixed), the math is backwards - a worsening result looks like a win, and a genuine improvement looks like a failure.
**Why it matters.** The system will approve harmful changes and reject beneficial ones for any "lower is better" metric, making automated quality decisions actively misleading.
**Real-world analogy.** Like a golf scoring app that treats a lower round as a loss - a player who shot 68 instead of 80 would be told they performed worse, while someone who shot 100 gets flagged as improving.
**Severity.** Fix soon

### TD-152 - The Auto-Update Check is Broken Due to a Typo
**What it is.** A small syntax mistake (a misplaced character in a short code snippet) causes the version-checking script to crash silently every time it runs, so the system never knows whether a newer version is available.
**Why it matters.** Users never see update notifications, meaning they stay on outdated versions indefinitely without knowing it - the update system is completely non-functional.
**Real-world analogy.** Like a "check for updates" button that silently does nothing because the server address was mistyped - you keep clicking it thinking you are up to date, but the check never actually runs.
**Severity.** Fix soon

### TD-153 - The Date Guard Rejects Valid Historical Records as Forgeries
**What it is.** A safety check that ensures timestamps in log files are recent also incorrectly rejects old historical entries (like records from 2024) when an entire log file is being rebuilt, treating them as wrong even though they are legitimately from the past.
**Why it matters.** Commands that reconstruct or populate a project's history log are blocked from running, preventing accurate historical records from being written at all.
**Real-world analogy.** Like a notary who refuses to certify a photocopy of a 1995 contract because the date on it is not within the last five minutes - the check is well-intentioned but applied to the wrong context.
**Severity.** Fix soon

### TD-154 - The Performance Scorecard Display Shows Blanks Because the Data File Is Never Created
**What it is.** The metrics dashboard reads from a summary file that is supposed to track project performance over time, but no part of the system ever writes that file - so the dashboard sections that show trends, scores, and breakdowns are permanently empty.
**Why it matters.** Teams cannot see milestone performance trends, domain breakdowns, or quality scores - the metrics features users might rely on for decisions are silently non-functional.
**Real-world analogy.** Like a car dashboard that has a fuel economy display, but the sensor that feeds it was never connected - the screen is there, the display logic works, but it always shows nothing.
**Severity.** Fix soon

### TD-155 - The Official List of Supported Modes Is Six Items Short
**What it is.** A reference document (the "contract") says the system supports 6 operating modes, but the actual software now supports 11 - 5 modes were added but never added to the official list, meaning the list is actively misleading.
**Why it matters.** Anything that relies on the official list to validate inputs (such as automated checks or onboarding tools) would incorrectly reject valid requests for the 5 unlisted modes.
**Real-world analogy.** Like a restaurant menu that lists 6 dishes but the kitchen can actually make 11 - servers told to only offer menu items will turn away customers asking for the 5 unlisted dishes that are available.
**Severity.** Fix soon

### TD-156 - The Official Rulebook for Project Status Files Is Missing Three Rules
**What it is.** The specification document that describes how project status files must be formatted is missing the "ACTIVE" status label (which real files use), a column that appears in actual tables, and the required format for recording times with time zones.
**Why it matters.** Automated tools that validate project files against this specification will flag valid files as broken, and new projects generated from the spec will be missing required fields from the start.
**Real-world analogy.** Like a building code that specifies rules for kitchens and bathrooms but forgets to mention living rooms - inspectors following the code would fail buildings for having living rooms that don't match rules that don't exist yet.
**Severity.** Fix soon


## 🟡 Medium (77)

### TD-157 - Instructions Point to a Tool That Was Removed
**What it is.** The setup guide tells agents to look for a specific file that handles automatic installation of a testing tool (Playwright). That file was deleted in a previous update and replaced with a different approach - but the instructions were never updated.
**Why it matters.** An agent following these instructions will look for a file that does not exist, get confused or stall, and potentially set up testing incorrectly.
**Real-world analogy.** Like an employee handbook telling new hires to check in with the "third-floor receptionist" after a renovation moved reception to the lobby and the third-floor desk was removed - newcomers waste time looking for something that is no longer there.
**Severity.** Schedule for later

### TD-158 - New Projects Are Configured With a Memory Limit 5x Too Small
**What it is.** The template used when creating new projects sets the "memory window" size to 200,000 units. The current AI models (Claude Opus and Sonnet 4.5+) can handle up to 1,000,000 units - meaning new projects are artificially capped at 20% of available capacity.
**Why it matters.** Projects will trigger unnecessary hand-offs to a slower fallback mode far earlier than needed, wasting processing resources and interrupting work that could have continued.
**Real-world analogy.** Like setting a car's GPS to assume the fuel tank holds 10 gallons when it actually holds 50 - the low-fuel warning fires constantly, causing unnecessary pit stops on trips where you had plenty of fuel.
**Severity.** Schedule for later

### TD-159 - Removing a Backlog Item Tries to Write to a File That May Not Exist
**What it is.** When removing an item from the backlog (a prioritized to-do list), the system tries to add a log entry to the project status file without first checking whether that file exists. A later step does check - but only after the write has already been attempted.
**Why it matters.** On projects that were not fully set up, this creates a corrupted or incomplete status file, since only the removal entry gets written without the required surrounding structure.
**Real-world analogy.** Like writing a note in a notebook without checking if the notebook is there - if it is missing, you end up with a loose page that has no context, no cover, and no table of contents.
**Severity.** Schedule for later

### TD-160 - The Change Log Format Is Different in Every Backlog Command
**What it is.** The official format for recording what changed in a project log requires a dash, a date, a time, and a colon. Each of the backlog commands (add, remove, edit, move) writes this log entry in a different format - some use tables, some use dashes instead of colons, some omit the time entirely.
**Why it matters.** Tools that parse the log to generate reports or check compliance will misread or skip entries, producing inaccurate audit trails.
**Real-world analogy.** Like a team of assistants all keeping meeting notes but each using a completely different format - some use bullet points, some use tables, some skip the time - making it impossible to search or compile the notes reliably.
**Severity.** Schedule for later

### TD-161 - The Installer Rewrites the Same Settings File Five Times in a Row Without Coordination
**What it is.** During installation, five separate steps each independently read the settings file, make their own changes, and write it back. If any two of these overlap or if another program touches the file at the same time, one set of changes will silently overwrite the other.
**Why it matters.** Settings can be silently lost during installation, leaving the tool partially configured with no error shown - leading to subtle failures later that are hard to trace back to the install.
**Real-world analogy.** Like five people simultaneously editing the same shared document without locking it - each saves their own version, and whoever saves last wins, silently erasing everyone else's changes.
**Severity.** Schedule for later

### TD-162 - A Retired Feature Is Still Being Installed on Every New Setup
**What it is.** A context-monitoring tool was removed in a previous update, and a note in the code even says not to install it anymore. Despite this, the installer still runs the installation step every time - the tool just silently does nothing because the file it needs is gone.
**Why it matters.** Every new install adds a dead hook to the system's settings file, creating clutter that could confuse future debugging and signals that the installer is not being kept tidy.
**Real-world analogy.** Like a move-in checklist that still says "plug in the fax machine" even though the office got rid of its fax machine two years ago - it wastes a moment and leaves people wondering if they missed something.
**Severity.** Schedule for later

### TD-163 - The Test-Result Reader Marks Passing Tests as Failed If They Mention the Word "Error"
**What it is.** The code that decides whether a test run passed or failed flags the entire run as failed if the word "error" appears anywhere in the output - including in phrases like "0 errors found" or "error handling tests passed."
**Why it matters.** Perfectly passing test runs can be incorrectly marked as failures, causing the debug loop to retry unnecessarily and potentially blocking progress on work that is actually complete.
**Real-world analogy.** Like a spam filter that blocks any email containing the word "problem" - a message saying "no problem here" or "problem solved" gets blocked the same as a real complaint.
**Severity.** Schedule for later

### TD-164 - Registering Two Projects at the Same Time Can Silently Lose One
**What it is.** When adding a project to the registry, the system reads the list, adds the new entry, and writes the whole list back. If two registrations happen at the same time, both read the same original list and each writes its own updated version - whichever finishes last erases the other's entry.
**Why it matters.** In scripts that set up multiple projects at once, some projects may never appear in the registry without any error being reported.
**Real-world analogy.** Like two hotel clerks simultaneously assigning room 204 to different guests using a paper ledger - each writes their own entry without seeing the other's, and one guest ends up without a room.
**Severity.** Schedule for later

### TD-165 - The "Scan" Command Does Nothing and Gives No Feedback
**What it is.** Typing "gsd-t scan" in the command line appears to work (it exits without an error) but actually does nothing at all - no scan runs, no output is shown, and no error is reported.
**Why it matters.** Users or scripts calling this command will believe a scan ran successfully, when in fact nothing happened - leading to missed analysis and false confidence.
**Real-world analogy.** Like pressing the "print" button on a printer that is out of paper - the button lights up and nothing happens, but no error light comes on either, so you walk to the printer expecting your document and find nothing.
**Severity.** Schedule for later

### TD-166 - One Step in the Execution Workflow Has No Model Assignment
**What it is.** Every step in the automated workflow is supposed to declare which AI model handles it (like choosing between a junior, mid-level, or senior analyst). The "integrate" step - which wires together work from multiple domains - is missing this declaration entirely.
**Why it matters.** Without an explicit assignment, the system may use an inconsistent or suboptimal model for this step, and the audit trail will have a gap where one step's model is unknown.
**Real-world analogy.** Like a surgery schedule that lists the lead surgeon for every procedure except one - the operation still happens, but no one knows who was supposed to be responsible, and accountability is unclear.
**Severity.** Schedule for later

### TD-167 - Four Workflow Scripts Are Hardcoded to Label Commits With "m61" Regardless of the Current Milestone
**What it is.** Four automation scripts that create code commits are hardcoded to label those commits "m61" (a specific milestone name from when they were written), even when they are running work for a completely different milestone.
**Why it matters.** The commit history becomes misleading - work done in milestone 79, for example, will be labeled as if it belongs to milestone 61, making it much harder to trace which changes belong to which release.
**Real-world analogy.** Like a filing system where every document gets stamped "Q3 2023" no matter what quarter it was actually created in - the stamp is there, but it points to the wrong time period for everything filed after Q3 2023.
**Severity.** Schedule for later

### TD-168 - The Safety Check for Workflow Scripts Only Tests One of Seven Scripts
**What it is.** There is an automated test that checks workflow scripts for forbidden operations (like directly accessing files or running system commands, which is not allowed in the sandbox). This test currently only checks one script out of seven - and the code itself notes that the other six are not yet covered.
**Why it matters.** Six workflow scripts could contain rule-violating code that ships undetected, potentially causing runtime failures or security issues in production.
**Real-world analogy.** Like a security checkpoint at an airport that only screens passengers on one of seven boarding gates - the check exists and works, but most travelers walk through uninspected.
**Severity.** Schedule for later

### TD-169 - The System Silently Rewrites Your Design Contracts Without Asking
**What it is.** When the orchestrator finds that an element name in a design contract file does not match its current records, it automatically picks what it guesses is the closest match and overwrites the file - without any confirmation from the user.
**Why it matters.** A deliberate, carefully named design element can be silently renamed to something the system guessed, corrupting the design contract without the user ever knowing - violating the explicit rule that destructive changes require approval.
**Real-world analogy.** Like an autocorrect that not only fixes typos but also silently renames products in your marketing copy based on what it thinks you meant - your carefully chosen brand name could be changed without you seeing a prompt.
**Severity.** Schedule for later

### TD-170 - A Cleanup Timer Fires Every Time Even When It Is Not Needed
**What it is.** When the system needs to stop a child process, it sends a gentle stop signal and then sets a five-second timer to force-stop it if it does not respond. The code that was supposed to cancel this timer if the process stops cleanly is broken, so the force-stop always fires five seconds later regardless.
**Why it matters.** Every cleanly stopped process triggers an unnecessary forced termination five seconds later, which can interrupt other work and leaves noisy signals in the process log.
**Real-world analogy.** Like a car alarm that is supposed to turn off when you unlock the car normally, but the auto-cancel is broken - so it always blares for five seconds even after a proper unlock.
**Severity.** Schedule for later

### TD-171 - The Unattended Mode Safety Gate Is Permanently Disabled Due to a Missing Field
**What it is.** The unattended mode (which runs tasks automatically without a user present) is supposed to check whether a task is too large to safely fit in the current session before starting. The function that estimates task size returns a placeholder with a missing field, so the check always sees the field as "undefined" and never actually gates anything.
**Why it matters.** The safety valve that prevents unattended tasks from running when they would exceed capacity is permanently bypassed, which could lead to tasks starting and failing partway through with no one there to intervene.
**Real-world analogy.** Like an overload sensor on an elevator that was wired up but the weight scale was never connected - the sensor circuitry is there, but it always reads zero, so the elevator never refuses a load even when dangerously overweight.
**Severity.** Schedule for later

### TD-172 - Certain Events Are Being Logged Twice With Slightly Different Labels
**What it is.** When a task is blocked or skipped due to a conflict, two different parts of the system each independently log the same event - but using different field names and formats, so the same thing appears twice in the event stream with inconsistent data.
**Why it matters.** Dashboards, reports, or any tool reading the event stream will see duplicate entries and may double-count blocked tasks, skewing metrics and making diagnostics harder.
**Real-world analogy.** Like two secretaries both logging the same cancelled meeting in different calendar apps with slightly different titles - the meeting appears twice in reports, making it look like two separate events.
**Severity.** Schedule for later

### TD-173 - The Partition Guide Points to a Command That No Longer Exists
**What it is.** The partition step instructions suggest using "/gsd-t-discuss" as a follow-up option if the milestone is complex. That command was retired several updates ago and no longer exists as a standalone option.
**Why it matters.** An agent following this instruction would try to invoke a command that does not exist, causing an error or confusion, and the user may not know how to access the discuss functionality through the current method.
**Real-world analogy.** Like a store directory that still lists "Customer Service - 2nd Floor" after customer service was moved to the ground floor and the old location became storage - people go to the wrong place and find nothing.
**Severity.** Schedule for later

### TD-174 - A Key Reference Uses the Wrong Package Name, Sending Lookups to a Dead End
**What it is.** A command file specifies a fallback location for the GSD-T package using the name "@tekyz/gsd-t". The actual published package is named "@tekyzinc/gsd-t" - the names differ by five characters, so the lookup always fails.
**Why it matters.** When the fallback is needed, agents cannot find the package, the copy operation fails, and users get prompted to intervene in what should be an automatic process.
**Real-world analogy.** Like a delivery driver using an address that says "123 Maple Street" when the building is actually on "123 Maplewood Street" - close but wrong, so the package never arrives.
**Severity.** Schedule for later

### TD-175 - Step 5 Is Missing From the Gap Analysis Process
**What it is.** The gap analysis command lists steps 0.5 through 4, then jumps directly to step 6 - step 5 is entirely absent. This skips the synthesis stage where results from parallel analysis threads should be gathered before the final document is written.
**Why it matters.** The document generated in step 6 may be written before all analysis inputs have been collected, resulting in an incomplete gap analysis that silently omits findings.
**Real-world analogy.** Like a recipe that instructs you to mix ingredients, bake, then serve - but skips the step where you check that the dish is actually done before taking it out of the oven.
**Severity.** Schedule for later

### TD-176 - The Health Check Does Not Recognize Four Valid Project Statuses
**What it is.** The health checker validates a project's status against a list of allowed values. Four statuses that the system legitimately writes - INITIALIZED, ROADMAPPED, ACTIVE, and EXECUTING - are not on that list, so valid projects in these states will be flagged as broken.
**Why it matters.** Projects that are working correctly will fail their health checks, creating false alarms and eroding trust in the health check tool.
**Real-world analogy.** Like a building inspection checklist that says "Occupancy status must be: Vacant, Under Construction, or For Sale" - but a legitimately occupied and fully permitted building fails the check because "Occupied" is not on the list.
**Severity.** Schedule for later

### TD-177 - The Help Page Says Wave Runs Six Phases When It Actually Runs Two
**What it is.** The help documentation states that the "wave" command runs six phases: partition, plan, impact, execute, test-sync, integrate, verify, and complete. In reality, wave only runs execute and verify - the other phases must be run manually beforehand.
**Why it matters.** Users expecting wave to handle the full workflow will be surprised when it starts mid-process, and may skip required setup phases thinking wave will cover them.
**Real-world analogy.** Like an airport shuttle service advertised as covering the whole journey from home to gate - but when you book it, you learn it only runs from the parking lot to the terminal; you still have to get yourself to the parking lot.
**Severity.** Schedule for later

### TD-178 - The Check-In Command Stages All Files, Including Potentially Sensitive Ones
**What it is.** The check-in (commit) command uses "git add -A" which stages every changed file for commit without review. The project's own rules explicitly prohibit this approach because it can accidentally include secret files like credentials or environment configuration.
**Why it matters.** A single use of this command on a project that has sensitive files in its working directory could commit those secrets to the version history, where they may be difficult to fully remove.
**Real-world analogy.** Like a "send all" button on an email client that attaches every file from your downloads folder to the message - usually harmless, but one careless click could send a document you never meant to share.
**Severity.** Schedule for later

### TD-179 - The Preflight Check That Validates Project Phase Is Always Wrong
**What it is.** A check that determines whether a project has advanced past the "partitioned" phase uses a pattern to read the status line from the project file. The pattern cannot handle the standard format (which starts with "## ") and therefore never finds a match, so it always reports the project as not yet partitioned.
**Why it matters.** Features and guardrails that depend on knowing the project's current phase will never activate correctly, because the phase is always reported as "not started" regardless of reality.
**Real-world analogy.** Like a GPS that checks your current street by looking for your address on signs that start with "Ave." only - if you live on a "St." or "Blvd.", it can never find you and always reports your location as unknown.
**Severity.** Schedule for later

### TD-180 - A Summary Builder Modifies Shared Data as a Side Effect
**What it is.** A function that builds a summary of verification results also silently adds entries to a notes list that was passed in from the caller. If the function is ever called more than once with the same notes list (such as during retries or testing), duplicate entries accumulate.
**Why it matters.** Verification summaries can contain repeated notes, making them look more alarming than they are and complicating any tool that counts or deduplicates findings.
**Real-world analogy.** Like a report-drafting assistant who, while writing a summary, also adds their own sticky notes to your original folder - if you ask them to redraft, they add more stickies each time, and you end up with a folder full of duplicates.
**Severity.** Schedule for later

### TD-181 - One Type of Playwright Config File Is Invisible to the Test Detection System
**What it is.** The verify-gate checks for Playwright testing config files by looking for three specific filenames. It misses the ".mjs" version (a modern JavaScript module format), so projects using that format have their entire end-to-end test suite silently excluded from verification.
**Why it matters.** Projects with end-to-end tests will pass verification without those tests being run, giving false confidence that everything is working when core user flows may be broken.
**Real-world analogy.** Like a building inspector who checks for smoke detectors with battery, wired, and combination units - but forgets to check for the newer wireless models, so buildings with only wireless detectors are signed off as having "no smoke detectors."
**Severity.** Schedule for later

### TD-182 - Three Preflight Checks Can Hang Indefinitely With No Timeout
**What it is.** Three safety checks that run before any verification - checking the current branch, checking for uncommitted changes, and checking whether required ports are free - can each stall forever if the underlying system command takes too long to respond. There is no time limit set on any of them.
**Why it matters.** A slow or unresponsive environment (such as a network-mounted file system) can cause the entire preflight process to hang indefinitely, blocking all work without any error message.
**Real-world analogy.** Like a security guard who checks IDs by calling a verification hotline with no hold-time limit - if the line is busy or the call is never answered, the entire entrance queue stops moving with no explanation.
**Severity.** Schedule for later

### TD-183 - The Final Verdict Can Ignore a Security Failure If the AI Summarizer Decides To
**What it is.** When the Red Team (adversarial security review) reports a critical failure, the final verdict is supposed to be "VERIFY-FAILED." But this rule is only enforced through instructions given to the AI summarizer - there is no code that programmatically checks and overrides a wrong verdict after the fact.
**Why it matters.** A summarizer that makes an error or behaves unexpectedly could return "VERIFIED" even when a critical security issue was found, allowing flawed code to be approved.
**Real-world analogy.** Like a hiring process where the background check report goes to the hiring manager with instructions saying "reject if anything serious is found" - but there is no HR override if the manager accidentally approves a candidate with a disqualifying result.
**Severity.** Schedule for later

### TD-184 - The Diagram Renderer's Third Fallback Option Is Permanently Unreachable
**What it is.** The diagram rendering system tries three tools in order: mmdc, then d2, then Kroki (a web-based rendering service). The Kroki option is written as an asynchronous (non-blocking) call, but the function that runs it is synchronous, so it never waits for Kroki's response and moves on immediately - making Kroki permanently unreachable.
**Why it matters.** Projects without mmdc or d2 installed will always get a placeholder instead of a rendered diagram, even if a Kroki server is available and configured.
**Real-world analogy.** Like a vending machine that tries three payment methods - cash, card, then a tap-to-pay sensor - but the tap-to-pay sensor requires a half-second to activate and the machine moves on after zero seconds, so tap-to-pay never works even when your phone is right there.
**Severity.** Schedule for later

### TD-185 - Cleanup code that never actually cleans anything up
**What it is.** A filtering step meant to remove duplicate findings from scan results does nothing, because the items it checks against are brand-new copies (not the originals), so the comparison always fails and nothing is ever removed.
**Why it matters.** Scan reports may contain duplicate findings that clutter the output and waste reviewer time, eroding trust in the tool's accuracy over time.
**Real-world analogy.** A bouncer checking IDs against a "do not admit" list, but the list contains photocopies of new IDs rather than the original faces -- so every person walks in regardless.
**Severity.** Schedule

### TD-186 - A special word in findings can accidentally cut a report short
**What it is.** When writing scan results to a file, the tool uses a special marker word ("GSDTEOF") to signal the end of content. If any finding's text happens to contain that exact word, the file writer stops early and silently drops everything after it.
**Why it matters.** A scan report could be quietly truncated, losing findings without any warning -- giving a false sense of completeness on a partial result.
**Real-world analogy.** A form that ends whenever it encounters the word "STOP" -- if a customer writes "stop loss" in a text field, the rest of their submission is silently discarded.
**Severity.** Schedule

### TD-187 - File ownership matching is too loose, causing wrong assignments
**What it is.** The tool assigns files to the team area that "owns" them by checking if the area's name appears anywhere inside the file path. Because it uses a simple contains-check rather than an exact match, short names like "api" or "bin" accidentally match unrelated files whose paths happen to contain those letters.
**Why it matters.** Ownership maps and impact reports will show the wrong area responsible for a file, leading to misdirected work and incorrect dependency analysis.
**Real-world analogy.** Sorting mail by checking if the street name appears anywhere on the envelope -- a letter addressed to "Robinson Street" gets routed to "Rob" because "rob" is inside "Robinson."
**Severity.** Schedule

### TD-188 - File tracking always reports everything as changed on Windows
**What it is.** The tool stores file paths using forward slashes, but when checking whether a file has changed on Windows it looks them up using backslashes. Since the formats never match, every file looks new or changed every time, even when nothing has changed.
**Why it matters.** Any Windows user of this tool will see unnecessary full rebuilds or re-scans on every run, wasting time and potentially masking real changes in the noise.
**Real-world analogy.** A filing system that stores folders under "Q/Reports" but looks for them under "Q\\Reports" -- every search comes up empty so the clerk refetches everything from scratch every time.
**Severity.** Schedule

### TD-189 - Functions with the same name across files all get credited to one arbitrary file
**What it is.** When the tool builds a map of which functions call which other functions, it only records the first function it encounters for each name. If multiple files define a function with the same common name (like "validate" or "init"), all calls to any of them get attributed to just one, picked arbitrarily.
**Why it matters.** The dependency graph becomes inaccurate -- one function appears far more connected than it is, others disappear from the map, and impact analysis for changes will point to the wrong place.
**Real-world analogy.** A company directory that lists only the first "John Smith" it finds -- every call or email intended for any John Smith gets logged against the same one, making his activity log enormous and everyone else's invisible.
**Severity.** Schedule

### TD-190 - Python's special built-in methods are invisible to the code analyzer
**What it is.** When analyzing Python code, the tool skips all methods whose names start with underscores -- except for the constructor. This means important built-in behaviors like how an object is printed, compared, iterated, or used as a context manager (the "with" statement) are completely absent from the code map.
**Why it matters.** Impact analysis and dependency graphs for Python projects will miss key parts of how classes behave, producing incomplete or misleading results when those behaviors are changed.
**Real-world analogy.** A staff directory that lists every employee's job title but omits everyone whose role starts with "Assistant" -- leaving out a whole category of people who handle critical day-to-day operations.
**Severity.** Schedule

### TD-191 - A specially crafted question can break the log file format and inject fake entries
**What it is.** When the tool records a missed escalation to a log file, it wraps the entry in a structured comment. If the recorded text contains a sequence of characters that looks like the comment's closing tag, the entry ends early and anything after it appears as raw unformatted content -- which could be made to look like a legitimate log entry.
**Why it matters.** Log files used for auditing or billing could be corrupted or spoofed, undermining trust in records and potentially causing incorrect reporting.
**Real-world analogy.** A paper form where the "end of section" marker is the word "DONE" -- if a customer writes "DONE" mid-sentence, the clerk treats everything after it as a new, separate submission.
**Severity.** Schedule

### TD-192 - The feedback endpoint accepts unlimited upload sizes and can crash the server
**What it is.** The tool's internal web server accepts file attachments (like screenshots) through several endpoints but never checks how large the incoming data is. A session with many large images -- or a deliberately oversized request -- will keep loading until the server runs out of memory and crashes.
**Why it matters.** A design review session with many screenshots could destabilize the server, interrupting ongoing work for everyone connected to it.
**Real-world analogy.** A suggestion box with no size limit on submissions -- someone drops in a full filing cabinet's worth of paper and jams the entire office mail system.
**Severity.** Schedule

### TD-193 - The design review tool broadcasts detailed page data to any eavesdropping website
**What it is.** When the design review tool runs inside an embedded frame, it sends messages containing full page layout data (styles, element positions, text content) without specifying who is allowed to receive them. Any other website that has loaded the same page in a frame could silently intercept all of this information.
**Why it matters.** Confidential design details, content, and visual structure of unreleased features could leak to third-party sites during a review session.
**Real-world analogy.** Shouting the contents of a confidential document across an open-plan office rather than handing it privately to the intended recipient -- anyone in the room can hear.
**Severity.** Schedule

### TD-194 - Compressed web responses from the preview server come out as garbled text
**What it is.** When the review server fetches pages from the app to display in the preview, it passes along the browser's request for compressed content but then tries to read the compressed response as plain text. The result is unreadable garbage rather than a working page preview.
**Why it matters.** Design review previews may display corrupted or blank content when the underlying app serves compressed responses, which is the default for most modern web frameworks.
**Real-world analogy.** Forwarding a vacuum-sealed package to someone who doesn't own a vacuum sealer and expecting them to open it normally -- the contents arrive intact but inaccessible.
**Severity.** Schedule

### TD-195 - Design verification only checks that elements exist, not that they look or work correctly
**What it is.** The automated design check confirms that page elements are visible and have non-zero size, but never checks colors, typography, chart types, data labels, or spacing -- the very things that make a design implementation correct or incorrect.
**Why it matters.** A screen can pass all automated design checks while looking completely wrong visually. The tool gives a false green light on broken implementations.
**Real-world analogy.** A building inspector who confirms a window is installed but never checks whether it opens, seals properly, or matches the approved design -- "window present" becomes the only criterion.
**Severity.** Schedule

### TD-196 - The design review command still uses an approach that was already proven not to work
**What it is.** The design review step tells an AI agent to wait for a file to appear by checking repeatedly in a loop -- a method that was explicitly abandoned in another part of the system after three failed attempts, with documented reasoning for why it does not work reliably.
**Why it matters.** Design review sessions may hang, time out, or miss completion signals, requiring manual intervention and breaking the automated review flow.
**Real-world analogy.** A dispatch center still sending a runner to check the fax machine every five minutes, even though the office switched to email two years ago and documented exactly why the fax approach kept failing.
**Severity.** Schedule

### TD-197 - A tiny gap between a safety check and a file write can be exploited
**What it is.** The tool checks whether a file is safe to write to, then writes to it -- but these two steps are not atomic (joined into one unbreakable action). In the tiny gap between check and write, an attacker on the same machine could swap the file for a link pointing somewhere else, causing the write to land in an unintended location.
**Why it matters.** On shared or multi-user systems, this could allow an attacker to redirect event log writes to overwrite arbitrary files they should not be able to touch.
**Real-world analogy.** A security guard checks a door is locked, turns to enter the code, and in that half-second someone swaps the lock -- the guard opens what they think is the right door but it leads somewhere else.
**Severity.** Schedule

### TD-198 - Very large messages over the live connection are decoded with the wrong length, corrupting the stream
**What it is.** The tool's internal communication channel (WebSocket) supports messages up to 18 petabytes per the protocol specification. The decoder reads only the lower half of the length field for large messages and ignores the upper half, producing a wrong byte count and misreading everything that follows.
**Why it matters.** Any unexpectedly large message (or one where the length encoding happens to use the upper bytes) will corrupt the entire connection stream, likely causing the tool to crash or behave unpredictably.
**Real-world analogy.** A shipping system that reads only the last four digits of a tracking number and ignores the first four -- most packages are routed correctly by coincidence, but some go to completely wrong destinations.
**Severity.** Schedule

### TD-199 - Messages that arrive in pieces over the network get silently dropped
**What it is.** The tool reads incoming network messages assuming each delivery contains a complete, self-contained message. Networks commonly split messages across multiple deliveries. When that happens, the tool quietly discards the incomplete tail without any error or retry.
**Why it matters.** Control messages (like connection-close signals) that arrive fragmented will be lost, potentially leaving connections in a broken state that requires manual restart.
**Real-world analogy.** A receptionist who only accepts complete sentences -- if a caller gets cut off mid-sentence, the receptionist hangs up and ignores the callback rather than waiting for the rest of the message.
**Severity.** Schedule

### TD-200 - The dashboard display can be hijacked to show attacker-controlled content
**What it is.** The live dashboard builds its display by inserting raw event data directly into the page without sanitizing it first. If any event contains HTML or script code in fields like event type, model name, or domain name, the browser will execute it as part of the page.
**Why it matters.** Anyone who can write a crafted event to the stream (or who controls a compromised agent) could inject content into the dashboard -- ranging from misleading text to scripts that steal session data.
**Real-world analogy.** A live news ticker that displays raw incoming feeds without editorial review -- a malicious contributor sends a message formatted as a "breaking news" banner announcing false information, and it appears indistinguishably on screen.
**Severity.** Schedule

### TD-201 - The live stream viewer accumulates data indefinitely and will eventually run out of memory
**What it is.** Several internal lookup tables used to track active tasks, tool calls, and wave sessions grow continuously throughout a session and are never cleared. After thousands of tasks, the browser tab holding the dashboard will consume an ever-increasing amount of memory.
**Why it matters.** Long-running unattended sessions -- the primary use case -- will gradually slow down and eventually crash the dashboard tab, losing visibility into ongoing work.
**Real-world analogy.** A whiteboard used for tracking active tasks where completed items are never erased -- after a year of use, every inch is covered and there is no room to write new items without replacing the board.
**Severity.** Schedule

### TD-202 - The agent graph viewer slows to a freeze as more agents are added
**What it is.** The dashboard redraws the entire agent relationship diagram from scratch on every incoming event. The drawing algorithm's work grows faster than the number of agents -- with 1,000 agents, each new event triggers a computation that is a million times heavier than with 1 agent.
**Why it matters.** Large parallel runs -- the most valuable use case for the dashboard -- are exactly the scenario where the browser tab will freeze and become unusable.
**Real-world analogy.** A team using a whiteboard to draw a full org chart from scratch every time one new employee joins -- manageable for 10 people, impractical for 100, and impossible for 1,000.
**Severity.** Schedule

### TD-203 - A path safety check is one character short of being fully effective
**What it is.** A security guard that prevents file writes from escaping a designated folder correctly adds a path separator when checking one write path, but forgets to add it when checking another. A cleverly named folder could slip past the incomplete check.
**Why it matters.** In a worst case, a crafted path could bypass the containment boundary and write transcript markers outside the intended directory.
**Real-world analogy.** A building access system that correctly blocks the door labeled "Storage" but accidentally allows entry to a door labeled "Storage-Admin" because it only checks that the name starts with "Storage."
**Severity.** Schedule

### TD-204 - A background hook reads the entire session history on every single action
**What it is.** Each time Claude uses any tool, a background script reads the complete conversation transcript from disk to extract a single piece of information. Transcripts grow to 10-15 megabytes in active sessions, so this full read happens dozens of times per minute.
**Why it matters.** In long or complex sessions, the repeated disk reads add measurable latency to every tool call, slowing down the overall pace of work.
**Real-world analogy.** A receptionist who, every time they need to look up a caller's account number, reads the entire company history from a filing cabinet rather than checking a sticky note on the desk.
**Severity.** Schedule

### TD-205 - The timestamp label in automated messages shows the wrong timezone abbreviation in some environments
**What it is.** The hook that stamps each session message with the current time derives the timezone label by taking the first letter of each word in the timezone's full name. This works for "Pacific Daylight Time" (PDT) but produces wrong results for single-word names like "UTC" (which becomes "CUT") and fails entirely in some server environments.
**Why it matters.** Session logs, audit trails, and the dated banner shown at the top of every response may display an incorrect or missing timezone, making it harder to correlate events across systems.
**Real-world analogy.** A clock display that labels time zones by abbreviating the name on the dial -- it correctly shows "EST" for "Eastern Standard Time" but shows "CUT" for "Coordinated Universal Time" instead of "UTC."
**Severity.** Schedule

### TD-206 - Special characters in a saved value can corrupt the progress file
**What it is.** When the tool writes a value into the progress tracker, it uses a text substitution function that treats certain character sequences (like "$&" or "$1") as special instructions rather than literal text. A value containing those sequences will be expanded or mangled in unexpected ways.
**Why it matters.** Progress file entries could be silently corrupted, causing incorrect state to be read back later -- potentially misreporting which milestone or phase is active.
**Real-world analogy.** A form-filling system where entering "$1" in a field causes the system to replace it with whatever was in the first field of the form, instead of saving the literal text "$1."
**Severity.** Schedule

### TD-207 - The safety guard that prevents automated pushes to the main branch is missing "main" from its list
**What it is.** The unattended (overnight) supervisor has a list of protected branches it will not push code to automatically. The list includes "master," "develop," and several others, but omits "main" -- which is this project's actual primary branch.
**Why it matters.** The supervisor could push untested or incomplete changes directly to the main branch without the human review gate that the protected-branch setting is meant to enforce.
**Real-world analogy.** A building security policy that prohibits unescorted access to rooms labeled "Server Room," "Archive," and "Executive Suite" -- but the main server room was recently relabeled "Primary Data Center" and nobody updated the list.
**Severity.** Schedule

### TD-208 - Test helper that replays recorded sessions never actually delivers any data to the page
**What it is.** A testing utility designed to feed pre-recorded session data into the dashboard for automated tests silently fails to deliver any of that data. The error is caught and discarded internally, so the test proceeds against an empty page and appears to pass.
**Why it matters.** Any test relying on this helper is testing an empty state, not the realistic scenario it was designed to validate. Bugs in session replay and data display will go undetected.
**Real-world analogy.** A fire drill where the alarm system's test button is broken and plays silence -- everyone stands by their desks waiting, the drill coordinator marks it "passed," and nobody finds out the alarm was never audible.
**Severity.** Schedule

### TD-209 - One version of a key installation function has never been tested
**What it is.** The tool ships two versions of the Playwright test runner installer: an asynchronous one (used most places, with 9 automated tests) and a synchronous one (used in background worktrees, with zero tests). The synchronous version duplicates all the same logic but none of its error handling or edge cases have ever been verified.
**Why it matters.** Silent failures during background Playwright installation in worktrees could leave test infrastructure broken without any diagnostic output, blocking automated verification.
**Real-world analogy.** A car manufacturer that thoroughly crash-tests the automatic transmission but ships the manual transmission variant without any testing, assuming the parts are similar enough.
**Severity.** Schedule

### TD-210 - The journey coverage tracker is hardwired to GSD-T's own internals and cannot be customized
**What it is.** The module that measures which user journeys are covered by tests has a fixed internal list of function names it looks for. That list is specific to GSD-T's own code and cannot be extended or overridden by projects that use GSD-T as a tool.
**Why it matters.** Consumer projects get journey coverage reports that only reflect GSD-T-internal entry points, not their own application's entry points -- making the coverage metric meaningless for them.
**Real-world analogy.** A mileage tracker app that only logs trips starting from the manufacturer's headquarters, regardless of where the actual driver lives or works.
**Severity.** Schedule

### TD-211 - Projects using modern Bun get detected as npm, causing a package manager mismatch
**What it is.** The tool identifies which JavaScript package manager a project uses by looking for a specific lockfile filename. Bun changed its lockfile name in early 2024, and the tool only recognizes the old name -- so all Bun v1.1+ projects are silently treated as npm projects.
**Why it matters.** Playwright gets installed using npm in projects that are managed by Bun, which can cause version conflicts, missing dependencies, or install failures in Bun-primary projects.
**Real-world analogy.** A courier service that identifies packages for air freight by looking for a blue label, but the shipper switched to green labels a year ago -- all recent packages get routed by ground without anyone noticing.
**Severity.** Schedule

### TD-212 - The stack detector knows about 8 of 26 technology types, silently ignoring the rest
**What it is.** When the tool analyzes a project to inject the right set of best-practice rules, it checks for 8 technology indicators. The rules library contains 26 technology-specific rule sets. The other 18 (Docker, GitHub Actions, FastAPI, Firebase, and more) are never detected and therefore never applied.
**Why it matters.** Projects using any of those 18 technologies receive no technology-specific guidance, and the tool silently gives them a partial rule set without any indication that coverage is incomplete.
**Real-world analogy.** A building code inspector who only checks electrical and plumbing but signs off on the full inspection report -- the 16 other categories (fire safety, structural, accessibility, etc.) go unchecked without any note that they were skipped.
**Severity.** Schedule

### TD-213 - Pre-mortem rule filtering ignores which domain the work belongs to
**What it is.** A function designed to retrieve risk rules relevant to a specific area of work accepts the domain name as input but never actually uses it -- it returns all active rules regardless of which domain is being analyzed.
**Why it matters.** Pre-mortem analysis surfaces irrelevant warnings for every domain, diluting useful signal with noise and potentially hiding domain-specific risks in a long undifferentiated list.
**Real-world analogy.** A doctor who, regardless of which body part the patient came in for, reads out every item from the full general health checklist -- the knee specialist also lectures on dental hygiene and eye strain.
**Severity.** Schedule

### TD-214 - Failed rule saves leave behind orphan temporary files that accumulate indefinitely
**What it is.** When saving rule data, the tool writes to a temporary file first and then renames it to the final location (a safe pattern). But if the write step fails partway through, the rename never happens and the temporary file is left on disk -- with no cleanup, ever.
**Why it matters.** On systems with disk pressure or recurring errors, these leftover temporary files accumulate indefinitely, consuming disk space and potentially confusing other tools that scan the directory.
**Real-world analogy.** A printer that creates a draft copy of each document before printing and shreds it after a successful print -- but when a paper jam occurs mid-print, the draft is never shredded and piles up in a drawer.
**Severity.** Schedule

### TD-215 - Adding a backlog item with no type and auto-categorize off produces a confusing failure
**What it is.** When adding an item to the backlog without specifying its type, and with automatic categorization turned off, the instructions say to infer the type if auto-categorize is on -- but give no instruction for what to do when it is off. The item then hits a validation step that requires a type, producing an unhelpful error.
**Why it matters.** Users who have disabled auto-categorize and forget the "--type" flag get a cryptic validation failure instead of a clear prompt listing their options.
**Real-world analogy.** A ticket kiosk that asks you to select a seat category, but if you skip that step and the "suggest for me" option is turned off, it just shows an error code instead of saying "please choose: General, VIP, or Accessible."
**Severity.** Schedule

### TD-216 - Two command files reference a contract document that does not exist
**What it is.** Two commands instruct the AI to check a specific file for format rules before making changes. That file does not exist -- the actual files with that information have different names. The AI will either skip the step silently or invent content for a contract that was never written.
**Why it matters.** Format compliance checks for backlog and settings files are skipped or based on hallucinated content, meaning format-breaking changes can ship undetected.
**Real-world analogy.** A checklist that says "consult the Building Code Appendix F" -- but Appendix F was never written. Inspectors either skip the check or make up what they think it should say.
**Severity.** Schedule

### TD-217 - The settings template ships with unfilled placeholder text that init does not replace
**What it is.** The backlog settings template contains placeholder tokens (like "{app1}" and "{app2}") that are meant to be replaced with actual app names during project setup. The setup tool only replaces two specific tokens and leaves these three as literal strings in the output file.
**Why it matters.** Projects where setup is interrupted or the AI skips the manual substitution step will have a settings file containing "{app1}" and "{app2}" as real values, causing silent misconfiguration.
**Real-world analogy.** A welcome letter template where the mail merge only fills in the recipient's name but leaves "[COMPANY_NAME]" and "[PLAN_TYPE]" as printed text in the letter body.
**Severity.** Schedule

### TD-218 - The entire backlog command surface has zero automated tests
**What it is.** There are no automated tests for any of the backlog commands (add, edit, move, remove, promote, settings) or for the function that reads and parses the backlog file. Known bugs in that parsing function and in the settings-removal logic have no automated safety net to catch regressions.
**Why it matters.** Any future change to backlog handling could silently break existing behavior, and bugs will only be discovered manually during real use rather than in a test run.
**Real-world analogy.** A warehouse inventory system where the receiving, picking, and returns processes have never been audited -- clerks follow the procedure as best they remember it, and discrepancies are only discovered during a customer complaint.
**Severity.** Schedule

### TD-219 - Milestone archival can leave progress notes in limbo if interrupted mid-save
**What it is.** When archiving a completed milestone, the tool writes three separate files in sequence without any crash protection. If the process is interrupted between the second and third write, the archive exists but the live progress file still contains the old (now-archived) content -- creating a split-brain state.
**Why it matters.** A crash during archival could result in milestone data appearing in both the archive and the live tracker, causing duplicate or contradictory state that requires manual cleanup.
**Real-world analogy.** Moving a file from one filing cabinet to another by photocopying it, placing the copy in the new cabinet, then shredding the original -- if the shredder jams mid-shred, the file exists in both places simultaneously.
**Severity.** Schedule

### TD-220 - New projects start with the wrong version number format
**What it is.** The project template file hardcodes the starting version as "0.1.0" (one-digit patch), but the documented convention and all related tooling expect "0.1.00" (two-digit patch). A project initialized from the template will immediately be out of sync with the versioning rules.
**Why it matters.** Automated version bumps and milestone-completion scripts may behave unexpectedly for any project whose initial version came from the template, producing non-conforming version strings.
**Real-world analogy.** A new employee onboarding form that uses last year's employee ID format -- the HR system accepts it at entry, but downstream payroll and access-control systems that expect the new format start rejecting the ID on day one.
**Severity.** Schedule

### TD-221 - Milestone Closeout Report Written Before It Has All the Facts
**What it is.** When closing out a milestone, the system writes the final summary document before it has calculated the new version number or quality score - then quietly relies on the AI to go back and fill in those blanks, with no explicit instruction to do so.
**Why it matters.** Milestone archives may permanently contain placeholder text instead of real version numbers or quality scores, making historical records unreliable for audits, release notes, or stakeholder reporting.
**Real-world analogy.** Printing a certificate of completion before the exam is graded, then hoping someone remembers to write the score in by hand afterward - with no reminder note attached.
**Severity.** Schedule - address in upcoming planned work.

### TD-222 - Two Simultaneous Syncs Can Silently Erase Each Other's Work
**What it is.** When two sync operations run at the exact same time on different projects (a shared configuration file is read, updated, and saved by both), whichever one finishes last wins and quietly discards all the changes the other one made.
**Why it matters.** Project settings or global rules updated by one sync job can be invisibly lost, leading to configurations drifting out of date with no error message or warning.
**Real-world analogy.** Two people editing the same shared Google Doc while offline - when they both reconnect and save, one person's entire set of changes disappears without any conflict notification.
**Severity.** Schedule - address in upcoming planned work.

### TD-223 - Internal Housekeeping Entry Breaks the Activity Ledger's Math
**What it is.** When the system compresses its activity log (a routine cleanup step), it inserts a special internal marker entry that does not count as a pass or a failure - causing the total entry count to no longer equal the sum of passes and failures.
**Why it matters.** Any dashboard or report that reads this log will show inconsistent numbers, undermining trust in metrics and potentially triggering false warnings or hiding real ones.
**Real-world analogy.** A cashier's till-count sheet that includes a 'shift change' line item in the transaction total but nowhere in the deposits or withdrawals columns - the sheet never balances and auditors flag it every time.
**Severity.** Schedule - address in upcoming planned work.

### TD-224 - The System's Usage Tracking Has No Automated Safety Net
**What it is.** The code responsible for recording all per-task performance data (how long tasks took, how many attempts were needed, etc.) has no automated tests - meaning no automatic check will catch if this tracking breaks.
**Why it matters.** If the tracking code silently breaks, dashboards and health reports will show wrong numbers or stop updating, and no alert will fire - the problem could go undetected for many milestones.
**Real-world analogy.** A factory's production counter has never been tested after installation - if it starts misreading output, the daily report will be wrong but the floor manager has no alarm to tell them the counter itself is broken.
**Severity.** Schedule - address in upcoming planned work.

### TD-225 - Token Count Field Accepts Nonsense Values Without Complaint
**What it is.** The field that records how many AI tokens (the basic unit of AI processing cost) a task used accepts text, negative numbers, or complex objects instead of rejecting them - and silently saves them to the permanent record.
**Why it matters.** Corrupted token counts flow into cost summaries and usage reports, making aggregate figures untrustworthy and potentially causing the system to make wrong decisions based on bad data.
**Real-world analogy.** An expense report system that accepts 'banana' or '-$500' in the amount field without flagging an error - the totals at month-end are meaningless.
**Severity.** Schedule - address in upcoming planned work.

### TD-226 - The Project's Official Completion Record Is Missing 14 Milestones
**What it is.** The master progress file has a formal table of completed milestones that stops at milestone 58. Milestones 59 through 79 - roughly 14 completed deliverables - exist only as informal narrative text and were never formally logged in the structured table.
**Why it matters.** Automated status reports, dashboards, and any tool that reads the completion table will show the project as far less advanced than it actually is, misrepresenting progress to stakeholders.
**Real-world analogy.** A construction project's official punch-list shows 58 items signed off, but 14 additional completed inspections exist only in the site supervisor's personal notebook - the bank's completion report is based on the official list.
**Severity.** Schedule - address in upcoming planned work.

### TD-227 - Seven Unfinished Specification Documents Are Flagging as Warnings Every Run
**What it is.** Seven interface specification documents (which define how different parts of the system talk to each other) are still marked as 'draft' or 'proposed' even though the project has moved well past the stage where all specs should be finalized - causing a system health warning on every run.
**Why it matters.** Persistent false warnings desensitize the team to alerts, and the warnings cannot be cleared without either finalizing or explicitly retiring these specs, which involves undocumented manual effort.
**Real-world analogy.** A building that received its occupancy permit two years ago still has seven open permit applications marked 'pending review' - the inspector's system flags them every week even though the building is fully operational.
**Severity.** Schedule - address in upcoming planned work.

### TD-228 - A Specification Document Lists Two Systems That No Longer Exist
**What it is.** A contract document that defines how token budget tracking works still names two specific programs as its users - but one program was deleted and the other was replaced by a completely different system months ago.
**Why it matters.** Any developer or AI agent following this document will look for programs that do not exist, wasting time and potentially wiring new code to the wrong place.
**Real-world analogy.** An apartment building's utility hookup guide still says 'call tenants in units 3B and 5A for access' - but those tenants moved out last year and the units are now storage rooms.
**Severity.** Schedule - address in upcoming planned work.

### TD-229 - A Process Guide Still Describes the Old Way of Running a Task
**What it is.** A specification document for the 'doc-ripple' process (which propagates documentation updates across the project) still describes the old method of spawning separate sub-tasks - but the actual code now uses a newer, unified workflow engine.
**Why it matters.** Any AI agent reading this document and following its instructions will use the outdated approach, bypassing the improvements built into the new engine and potentially producing inconsistent results.
**Real-world analogy.** The employee handbook still says 'submit expense reports by fax' but the company switched to an online portal a year ago - new hires follow the handbook and wonder why no one receives their faxes.
**Severity.** Schedule - address in upcoming planned work.

### TD-230 - The Project Activity Log Is Missing an Entire Required Section
**What it is.** The official format for the progress file requires a 'Session Log' section - a running diary of every work session - but this section does not exist at all in the actual file.
**Why it matters.** There is no chronological record of what was accomplished session by session, making it impossible to reconstruct the project timeline or understand what work happened between milestones.
**Real-world analogy.** A patient's medical chart is required by clinic policy to include a 'visit notes' section, but the entire section was never created - the chart has diagnoses and prescriptions but no record of any actual appointments.
**Severity.** Schedule - address in upcoming planned work.

### TD-231 - The Requirements Document Has Not Been Updated in Over 14 Milestones
**What it is.** The document listing what the system is supposed to do was last updated in March 2026 and covers only through milestone 56. Everything built since then - 14+ milestones of real features - has no corresponding requirement entries.
**Why it matters.** New team members, auditors, or AI agents cannot determine from official documentation what the system is supposed to do today, making onboarding, scoping, and compliance checks unreliable.
**Real-world analogy.** A restaurant's official menu hasn't been reprinted since last spring - 14 new dishes are on the specials board but nowhere in the kitchen's official prep manual, so new cooks have no written guidance for them.
**Severity.** Schedule - address in upcoming planned work.

### TD-232 - The Architecture Overview Shows the Wrong Number of Commands and Describes Deleted Systems
**What it is.** The architecture document says the system has 49 commands (the real count is 51) and was last updated 14 months ago. It still describes several internal programs that have since been deleted or replaced.
**Why it matters.** Anyone using this document to understand how the system is structured - for onboarding, auditing, or planning new features - will get an inaccurate picture of what actually exists.
**Real-world analogy.** A corporate org chart shows 49 employees across three departments, lists two managers who left the company, and is dated 14 months ago - the actual org has 51 people and a restructured team.
**Severity.** Schedule - address in upcoming planned work.

### TD-233 - The Workflow Guide Is Frozen at a 61-Milestone-Old Snapshot
**What it is.** The document describing how all the system's processes flow was last updated when milestone 17 was complete. The project is now at milestone 79+, meaning over 60 milestones of workflow changes - including the entire new orchestration engine - are completely absent.
**Why it matters.** The workflows document is the primary reference for understanding how the system operates. Using it now would give a fundamentally wrong picture of how work actually moves through the system.
**Real-world analogy.** An airport's operations manual describes terminals, gates, and security procedures from 2024 - but since then a new terminal was built, two old ones were demolished, and the entire check-in process moved to self-service kiosks. The manual still says 'proceed to counter B3.'
**Severity.** Schedule - address in upcoming planned work.


## 🟢 Low (60)

### TD-234 - A Coordination Document Points to a Retired Component and Has a Mismatched Version Number
**What it is.** The wave-join contract (which defines how parallel work streams are coordinated) still names a program that was officially retired three milestones ago, and the version number the code references does not match the version number on the document itself.
**Why it matters.** Agents following this contract may attempt to use a program that no longer exists, and the version mismatch makes it unclear which behaviors from which version apply.
**Real-world analogy.** A relay race handoff guide still says 'pass the baton to runner in lane 4 wearing the red bib' - but that runner was replaced, and the bib colors changed last season.
**Severity.** Clean up eventually - low urgency.

### TD-235 - A Failure Detector Could Mistake a Safe Log Message for a Critical Error
**What it is.** The pattern used to detect 'FAIL' messages in AI output is broad enough that a legitimate log line starting with 'FAIL-SAFE:' or similar could be misread as a task failure.
**Why it matters.** A false positive failure detection could cause the system to abort a successful task or trigger unnecessary error handling, wasting time and potentially confusing operators.
**Real-world analogy.** A fire alarm sensor set to trigger on the word 'fire' - it correctly catches 'fire detected' but also trips on 'fire sale begins at noon' over the PA system.
**Severity.** Clean up eventually - low urgency.

### TD-236 - A Safety Check Fires After the Action It Was Meant to Prevent Has Already Happened
**What it is.** When updating a project configuration file, the system reads the file first, then checks whether the file is a shortcut (symlink) that points somewhere else - but the check was meant to prevent reading through shortcuts, not just writing.
**Why it matters.** The protection is logically misplaced: if a file is a dangerous shortcut, its contents have already been read by the time the check runs, making the guard ineffective for its intended purpose.
**Real-world analogy.** A bank teller checks whether a cheque is post-dated after already processing the withdrawal - the guard exists but runs a step too late to stop the action.
**Severity.** Clean up eventually - low urgency.

### TD-237 - A File Is Read Twice With a Gap in Between Where Another Process Could Change It
**What it is.** A sync function reads a shared configuration file, modifies some values in memory, then reads the same file again before saving - leaving a window where another process could change the file between the two reads, causing the second read's version to overwrite the first process's changes.
**Why it matters.** Configuration updates from concurrent operations could be silently lost, leading to stale or inconsistent global settings with no error logged.
**Real-world analogy.** An inventory clerk counts the warehouse stock, writes adjustments on paper, then recounts before filing - if a delivery arrived between the two counts, the final tally ignores the new stock.
**Severity.** Clean up eventually - low urgency.

### TD-238 - The AI Output Collector May Record Every Response Twice
**What it is.** The component that reads streaming AI output collects text from both the live stream (chunks as they arrive) and the final assembled message - meaning the same content could be concatenated twice into the stored result.
**Why it matters.** Duplicated output stored in logs or passed to downstream tools will produce garbled results or inflated token counts, making records unreliable.
**Real-world analogy.** A stenographer who types every word as it is spoken and then types the whole speech again from the recording afterward - the transcript contains every sentence twice.
**Severity.** Clean up eventually - low urgency.

### TD-239 - A Dependency Is Loaded by the Wave Coordinator But Never Actually Used
**What it is.** The wave workflow file imports a shared helper library at startup but never calls anything from it - the import is dead code that also triggers a sandbox error that crashes the workflow.
**Why it matters.** This unused import is one of the direct causes of the wave workflow failing to run at all; removing it is a prerequisite for fixing the crash.
**Real-world analogy.** A delivery truck that loads a full toolbox it never opens - harmless in isolation, but if the toolbox is the reason the cargo door won't close, it becomes the first thing to remove.
**Severity.** Clean up eventually - low urgency.

### TD-240 - A File Path Tool Is Imported by the Execute Workflow But Never Called
**What it is.** The execute workflow loads Node.js's built-in file path utility at startup but never uses it anywhere in the file - it is dead code that also contributes to the sandbox crash.
**Why it matters.** Like TD-239, this unused import participates in causing the workflow to fail; it must be removed as part of fixing the sandbox error.
**Real-world analogy.** A chef who pulls out a mandoline slicer at the start of service but only ever uses a knife - harmless until kitchen regulations say unused tools on the counter are a safety violation.
**Severity.** Clean up eventually - low urgency.

### TD-241 - A Validation Step Only Works for Two Specific Frontend Technologies
**What it is.** The code that checks whether UI components exist and are structured correctly is hardcoded to look only in a 'src/components' folder and only for files ending in '.vue' or '.tsx' - meaning it silently skips projects built with React (.jsx), Svelte (.svelte), or any other technology.
**Why it matters.** Projects using other frontend technologies will pass this validation even if their component structure is completely broken, giving false confidence.
**Real-world analogy.** A building inspector who only checks brick-and-mortar construction - a wood-frame house passes inspection by default because the checklist was never written for it.
**Severity.** Clean up eventually - low urgency.

### TD-242 - After Generating 1MB of Output, Every New Line Requires Three Separate Disk Operations
**What it is.** Once a worker's output exceeds 1 megabyte, the system switches to writing each new chunk by opening the file, writing the data, and immediately closing it - three disk operations per chunk instead of keeping the file open.
**Why it matters.** For verbose AI workers producing thousands of output lines, this causes significant slowdown that is completely avoidable with a simple file-handle change.
**Real-world analogy.** A warehouse worker who, after filling the first storage bin, walks back to the office, signs out a new bin, fills it one item at a time, and returns the bin to the office between each item - instead of just keeping the bin open.
**Severity.** Clean up eventually - low urgency.

### TD-243 - A Calculation in the Dry-Run Report Always Produces Zero Regardless of Input
**What it is.** A piece of code that decides whether to show a 'reduced task count' line in the dry-run summary contains a comparison where both possible outcomes of a conditional produce the same value (zero), making the entire condition meaningless.
**Why it matters.** The display logic is silently broken - the reduced count line may never appear (or always appear) regardless of actual data, making dry-run output misleading.
**Real-world analogy.** A thermostat that reads 'if temperature is above 70, set fan to speed 0; otherwise set fan to speed 0' - the condition exists but the fan behavior is identical either way.
**Severity.** Clean up eventually - low urgency.

### TD-244 - A Folder Name on Disk Could Inject Arbitrary Commands into a Shell Operation
**What it is.** When scanning domain directories for git history, the system builds a shell command by inserting the folder name directly into a command string without sanitizing it. A maliciously named folder (which could be created by accident or by an attacker) could cause the system to run unintended commands.
**Why it matters.** If a project's domain directory has an unusual name, it could trigger unintended behavior or, in a worst case, execute arbitrary system commands during a routine git history check.
**Real-world analogy.** A receptionist who reads names from a visitor log directly over the intercom without checking them first - a visitor who wrote '...please unlock all doors' as their name could cause an unintended announcement.
**Severity.** Clean up eventually - low urgency.

### TD-245 - A File References 'Step 8' of a Process That Only Has Three Steps
**What it is.** The complete-milestone command file says it is 'auto-invoked by verify (Step 8)' - but the current verify command only has three steps. Step 8 existed in an older version of the workflow that was replaced during a major platform update.
**Why it matters.** Agents or developers reading this reference will look for a Step 8 that does not exist, causing confusion about when and how milestone completion is triggered.
**Real-world analogy.** A recipe that says 'as instructed in Step 8, add the eggs' - but the recipe only has five steps, and Step 8 was from an older version that was never updated.
**Severity.** Clean up eventually - low urgency.

### TD-246 - An Internal Comment Directs Readers to a Step That Belongs to a Different Agent
**What it is.** A comment inside the quick-task workflow tells the executing agent to 'fall through to Step 0.1' - but Step 0.1 is a step in the outer coordinating agent's instructions, not in the worker agent's own script.
**Why it matters.** An agent following this instruction will look for a step it has no access to, causing confusion or incorrect branching behavior.
**Real-world analogy.** An assembly line worker's instruction card says 'if part is defective, follow Step 0.1 in the plant manager's manual' - but the worker only has their own station card, not the manager's manual.
**Severity.** Clean up eventually - low urgency.

### TD-247 - A Numbered List Has Two Items Both Labeled Number 4
**What it is.** The resume command's list of files to load when resuming a session has a duplicate item number - two separate entries are both labeled '4', causing the list to be numbered 3, 4, 4, 5, 6, 7, 8 instead of sequentially.
**Why it matters.** An agent following this list in order may skip or repeat a step due to the numbering error, potentially missing a file needed for a complete context restoration.
**Real-world analogy.** A packing checklist where two different items are both labeled line 4 - the person checking items off may tick both or skip one, thinking they already completed that number.
**Severity.** Clean up eventually - low urgency.

### TD-248 - One Command Allows Three Fix Attempts While the Rest of the System Only Allows Two
**What it is.** The quick-task command allows up to three attempts to fix a failing test before escalating, while the global system rule and all other commands cap fix attempts at two.
**Why it matters.** This inconsistency means agents running quick-mode tasks will spend one extra fix cycle before handing off, diverging from the established system-wide behavior and potentially masking persistent issues.
**Real-world analogy.** A customer service policy that says agents should try to resolve a complaint twice before escalating to a manager - except the quick-resolution desk, which tries three times, delaying escalations that need senior attention.
**Severity.** Clean up eventually - low urgency.

### TD-249 - A Project Template Uses a Human-Time Metric That the System Explicitly Prohibits
**What it is.** The project setup template includes a column called 'Est. Sessions' and a guideline saying milestones should take '1-3 focused sessions' - but the system's own rules explicitly ban human-time estimates because AI workers do not operate on session-based timescales.
**Why it matters.** New projects created from this template will have a misleading planning column that encourages human-time thinking, which has no predictive value for AI-driven workflows.
**Real-world analogy.** A factory scheduling template designed for robot assembly lines that still has a 'worker lunch break' column - the column is meaningless for the actual workforce but gets filled in out of habit.
**Severity.** Clean up eventually - low urgency.

### TD-250 - A Checklist Refers to a File Without Its Full Path, Causing Agents to Look in the Wrong Place
**What it is.** The triage-and-merge command's pre-commit checklist mentions 'GSD-T-README.md' without the 'docs/' folder prefix, while the actual file lives at 'docs/GSD-T-README.md'. The same command correctly uses the full path elsewhere.
**Why it matters.** An agent following the checklist may look for the file at the project root, fail to find it, and either skip the update or report an error - leaving a required document unupdated.
**Real-world analogy.** A filing procedure that says 'update the compliance form' without specifying whether it means the one in the 'Active' drawer or 'Archives' - the clerk updates the wrong copy.
**Severity.** Clean up eventually - low urgency.

### TD-251 - The Help Reference Table Is Missing Two Commands That Actually Exist
**What it is.** The main help command's reference table - the first thing users see when they ask for help - lists 50 commands but omits two real, working commands: the design audit tool and the metrics dashboard.
**Why it matters.** Users and agents who check the help table will not know these commands exist and will not use them, reducing the value of features that were deliberately built.
**Real-world analogy.** A restaurant menu that lists 50 dishes but leaves off two house specials that are fully available - diners never order them because they do not appear on the menu.
**Severity.** Clean up eventually - low urgency.

### TD-252 - Three Command Files Reference Version 1.0 of a Specification That Is Now at Version 2.0
**What it is.** The status and resume commands cite version 1.0 of the headless-default contract, but the current version is 2.0 - which introduced a fundamentally different default behavior (headless mode is now always on by default, inverted from v1.0).
**Why it matters.** Agents consulting these commands alongside the v1.0 contract spec will operate under the wrong default assumption, potentially spawning tasks the wrong way.
**Real-world analogy.** Three department procedures reference the old remote-work policy (2022 version) where office attendance was the default - the 2024 policy flipped the default to remote-first, but the procedures were never updated.
**Severity.** Clean up eventually - low urgency.

### TD-253 - A Routine Deletion Step Always Pauses to Ask for Human Approval, Even in Fully Automatic Mode
**What it is.** The backlog-remove command always stops and asks the user to confirm before deleting a backlog item, even when the system is configured to run in full-auto mode where only truly irreversible actions should require approval. Removing a backlog item is reversible via version control.
**Why it matters.** Unnecessary confirmation prompts interrupt automated workflows and defeat the purpose of full-auto mode, requiring human attention for actions that pose no real risk.
**Real-world analogy.** An automated factory line that stops and sounds an alarm asking for human sign-off every time it moves a part from one conveyor to the recycling bin - even though those parts can always be retrieved.
**Severity.** Clean up eventually - low urgency.

### TD-254 - Automated Commit Messages Credit an Older AI Model Version
**What it is.** The cpua command template hardcodes 'Claude Opus 4.7' in the automatic co-authorship line added to every commit message, but recent commits and current system guidelines use 'Claude Opus 4.8'.
**Why it matters.** Every release commit created using this template will permanently record the wrong model version in git history, creating an inaccurate audit trail of which AI assisted with each change.
**Real-world analogy.** A company's standard email signature still says 'Powered by Office 2019' after the company upgraded to Office 2024 - every email sent carries incorrect branding.
**Severity.** Clean up eventually - low urgency.

### TD-255 - The Contract Health Check Cannot See Design Specs Stored in a Subfolder
**What it is.** The preflight check that warns about unfinished specification documents only looks in the main contracts folder. Design contracts stored in a 'design' subfolder - which is a documented and supported location - are completely invisible to this check.
**Why it matters.** Draft or proposed design contracts will never trigger the 'unfinished specs' warning, allowing stale design documentation to accumulate without any automated alert.
**Real-world analogy.** A building inspector who checks all the permits filed in the main cabinet but never opens the drawer labeled 'design drawings' - incomplete permits filed there pass inspection by default.
**Severity.** Clean up eventually - low urgency.

### TD-256 - The CI Compatibility Checker Only Reads the First Automation File and the First Section Within It
**What it is.** The tool that checks whether the project's continuous integration setup matches what developers run locally reads only the first automation file (alphabetically) and stops after the first job section within that file.
**Why it matters.** Projects with multiple automation files or multi-stage pipelines (build, test, deploy as separate stages) will have most of their CI commands go unchecked, making the parity report incomplete and potentially misleading.
**Real-world analogy.** A health inspector who checks only the first page of a restaurant's inspection report and only the first item on the menu for allergen compliance - everything after page one is assumed to be fine.
**Severity.** Clean up eventually - low urgency.

### TD-257 - Tool startup freeze on large codebases
**What it is.** When the GSD-T tool starts up, it reads every code file in your project one by one before doing anything useful. On a large project with thousands of files, this can cause the tool to appear frozen for several seconds.
**Why it matters.** Developers waiting on a stalled tool lose time and trust in the tool; repeated freezes reduce adoption.
**Real-world analogy.** Like a librarian who, before answering any question, physically reads every book on the shelf from cover to cover first.
**Severity.** Clean up eventually

### TD-258 - Unused code left over from an abandoned design
**What it is.** Several functions and a data variable were written for a feature that was never completed and then abandoned. They still sit in the codebase doing nothing (a variable that is always empty, functions that are never called).
**Why it matters.** Dead code adds confusion for anyone reading or maintaining the codebase, and slightly increases the size of every release package.
**Real-world analogy.** Like keeping a staff desk, phone, and login badge for an employee who left the company years ago - it takes up space and confuses new hires.
**Severity.** Clean up eventually

### TD-259 - A "remembered choice" feature that nobody actually reads
**What it is.** The tool has logic to remember which data source it chose last time (so it does not have to re-evaluate), but the part of the code that actually fetches data ignores that remembered choice entirely and evaluates from scratch every time.
**Why it matters.** The memory system provides a false sense of optimization; if the chosen provider ever needs to be stable across calls, the caching gives no protection.
**Real-world analogy.** Like a receptionist who writes down which doctor is on call on a notepad, but every incoming call still goes to the full switchboard routing system because nobody reads the notepad.
**Severity.** Clean up eventually

### TD-260 - "Is the data fresh?" check always says yes, even when it is not
**What it is.** There is a function that is supposed to tell other parts of the tool whether its internal index (catalog of your project's files) is out of date. It always reports "up to date" regardless of whether files have actually changed.
**Why it matters.** Any feature that relies on this check to decide whether to refresh its data will silently operate on stale information, potentially surfacing outdated results to the user.
**Real-world analogy.** Like a store inventory system that always reports "stock is current" even when items have been sold out, so staff never trigger a reorder.
**Severity.** Clean up eventually

### TD-261 - Duplicate-detector misses some pairs when three or more items share the same name
**What it is.** The tool's feature for finding duplicate items compares neighbors in a sorted list but skips non-adjacent pairs. With three items named identically (A, B, C), it checks A vs B and B vs C but never A vs C.
**Why it matters.** Duplicate reports are incomplete; some real duplicates will never be flagged, giving a false impression that the codebase is cleaner than it is.
**Real-world analogy.** Like a fraud team that reviews consecutive transactions on a statement but never compares the first and last transaction in a cluster - so some matches slip through.
**Severity.** Clean up eventually

### TD-262 - Test-to-code mapping only looks in the top level of the test folder
**What it is.** The feature that links test files to the code they cover only scans the immediate test folder, not any sub-folders inside it. Projects that organize tests into sub-folders (unit tests, integration tests, component tests) are invisible to this feature.
**Why it matters.** The tool reports "no tests found" for well-tested codebases that use organized folder structures, giving a misleading quality picture.
**Real-world analogy.** Like a building inspector who only checks the ground floor for fire exits, not any upper floors, then reports "no exits on floors 2-10."
**Severity.** Clean up eventually

### TD-263 - A settings value read before it has been defined - potential crash on fast interactions
**What it is.** In the design-review screen, a piece of code reads a list of allowed values before that list has been set up. Under normal loading this works by accident, but a fast user action during page load could trigger it too early, causing the screen to crash.
**Why it matters.** An intermittent crash on the design-review screen would disrupt the designer workflow and be very hard to reproduce and diagnose.
**Real-world analogy.** Like a chef who grabs a sauce recipe card from a holder that has not yet been filled - usually fine because prep is done before service, but if a waiter rushes an order the card is missing.
**Severity.** Clean up eventually

### TD-264 - Design contract discovery silently skips entries that point to a URL instead of a file
**What it is.** The system that finds design contracts (documents defining what a screen should look like) reads a list of links. If any link points to a web address rather than a local file, the discovery step quietly ignores it with no warning.
**Why it matters.** Designers or PMs who link to a hosted spec instead of a local file will find their design contract is never picked up by the tool, with no explanation.
**Real-world analogy.** Like a building permit office that accepts applications by post but silently discards any that arrive by email, without notifying the sender.
**Severity.** Clean up eventually

### TD-265 - Dashboard loads third-party code from the internet with no safety verification
**What it is.** The monitoring dashboard fetches charting and layout libraries from public content-delivery networks (external internet servers) every time it loads, using version tags that can point to different code over time. There are no checksums ("integrity hashes") to verify the code has not been tampered with.
**Why it matters.** If a CDN is compromised or silently changes the library, arbitrary unauthorized code could run in the operator's browser session. One of the libraries used (React 17) is also no longer receiving security updates.
**Real-world analogy.** Like installing a new door lock by ordering whichever part the hardware store recommends that week, with no verification that what arrives is the part you approved - and the locksmith who made the original design is no longer answering calls.
**Severity.** Clean up eventually

### TD-266 - File-writing errors can crash the live session server
**What it is.** The server that streams live session data writes to log files. If the disk runs out of space or the tool loses permission to write, Node.js (the underlying runtime) treats that as a fatal crash and kills the entire server process.
**Why it matters.** A full disk or a permission hiccup during an active session would silently disconnect all connected dashboards and monitoring tools.
**Real-world analogy.** Like a radio broadcast tower that shuts off completely the moment a single relay station reports a fault, rather than logging the fault and staying on air.
**Severity.** Clean up eventually

### TD-267 - Dashboard and data server use different default port numbers
**What it is.** When the dashboard is opened without an explicit configuration, it tries to connect on port 7433. The data server it needs to talk to defaults to port 7842. When the numbers do not match, the dashboard shows "Connecting..." forever with no error message.
**Why it matters.** Any user who opens the dashboard without passing the correct port parameter sees a permanently stuck screen and receives no guidance on how to fix it.
**Real-world analogy.** Like two walkie-talkie users who each assume a different default channel - both transmit, neither hears the other, and neither is told there is a mismatch.
**Severity.** Clean up eventually

### TD-268 - Privacy filter accidentally censors harmless command options in session logs
**What it is.** A filter meant to hide sensitive passwords in log summaries matches any command that uses the "-p" flag, not just password-related ones. Common commands like SSH (port), grep (pattern mode), and git (paginate) all have their option values replaced with "***" in the activity stream.
**Why it matters.** Session logs and the monitoring dashboard show garbled command summaries, making it harder to diagnose what the tool actually did during a session.
**Real-world analogy.** Like a company email compliance filter that redacts any word following "port," so shipping addresses and network configuration notes all arrive partially blacked out.
**Severity.** Clean up eventually

### TD-269 - The same contract-reading code copied into three different files
**What it is.** A small routine that reads and parses design contract files is copied word-for-word in three separate places in the codebase. All three copies do exactly the same thing.
**Why it matters.** Any bug fix or improvement must be applied three times. If someone updates only one copy, the other two silently keep the old (potentially broken) behavior.
**Real-world analogy.** Like a company that keeps its refund policy in three separate printed manuals - when the policy changes, someone has to remember to update all three, and it only takes one missed update to cause customer disputes.
**Severity.** Clean up eventually

### TD-270 - Two pieces of unreachable code left over from old refactors
**What it is.** Two separate code fragments will never execute: one is a variable declared but never written to (a leftover from an incomplete rewrite), and the other is a return statement placed after a "stop the program immediately" command, so it can never be reached.
**Why it matters.** Dead code adds noise, can confuse future developers into thinking a feature is active when it is not, and may mask gaps in test coverage.
**Real-world analogy.** Like a flight checklist that includes a step after "engine off and plane parked" - harmless on every real flight, but someone might someday wonder whether it should actually be doing something.
**Severity.** Clean up eventually

### TD-271 - File paths in activity logs show full system paths instead of short project-relative ones
**What it is.** When the tool summarizes file activity in its event stream, it is supposed to show short paths relative to your project (e.g., "src/app.js"). Instead it uses the wrong starting directory and shows the full absolute path (e.g., "/Users/alice/projects/MyApp/src/app.js").
**Why it matters.** Dashboard and heartbeat logs are harder to read; log-size increases slightly; any tooling that parses relative paths from the stream will fail to match.
**Real-world analogy.** Like a warehouse picking system that prints the full GPS coordinates of every shelf location instead of the aisle-and-bin code that workers actually use.
**Severity.** Clean up eventually

### TD-272 - A monitoring script that can never trigger because the system it monitors was removed
**What it is.** There is a hook (an automatic background script) that listens for a specific system status before recording a metric. The component that ever produced that status was deleted in a previous release. The hook now runs silently on every session start and always does nothing.
**Why it matters.** The metric it was meant to record (tracking how often context compaction happens in unattended mode) is never written, leaving a gap in operational visibility. The dead code also adds noise.
**Real-world analogy.** Like a smoke detector wired to a fire-suppression system in a room that was demolished - the detector still beeps its self-test every week, but the room it would protect no longer exists.
**Severity.** Clean up eventually

### TD-273 - "Is the background task alive?" check misreads a permission error as a crash
**What it is.** The watch command that monitors background (unattended) tasks checks whether a process is still running by sending it a harmless signal. If the operating system says "you don't have permission to check that," the code treats it as "the process is dead" - when it actually means "the process is alive but owned by someone else."
**Why it matters.** A supervisor task running under a different user account (e.g., a shared server or elevated process) would be falsely reported as crashed, potentially triggering unnecessary restarts or alerts.
**Real-world analogy.** Like a security guard who, unable to see through a frosted-glass office door, assumes the room is empty rather than concluding someone is inside with privacy mode on.
**Severity.** Clean up eventually

### TD-274 - Corrupt status file causes the watch command to loop silently forever
**What it is.** If the file that records the background task's status is temporarily unreadable or corrupted, the watch command ends up in a state where none of its decision steps match. It quietly reschedules itself and waits again, showing no output and giving the user no indication that something is wrong.
**Why it matters.** A transient disk or write issue during an unattended run could cause the watch loop to spin indefinitely with no alert, making the session appear healthy when it is actually stuck.
**Real-world analogy.** Like an answering service that, upon receiving a garbled message, re-queues the call indefinitely rather than flagging it as unreadable and notifying the recipient.
**Severity.** Clean up eventually

### TD-275 - Milestone completion check can match the wrong milestone when names are short
**What it is.** When the unattended-watch command checks whether a milestone has been archived, it searches by looking for the milestone name anywhere inside an archive folder name. A short name like "M5" would accidentally match archived milestones named "M55," "M57," or "M51," potentially declaring the wrong milestone complete.
**Why it matters.** A false-positive completion report could cause the tool to move on and dismiss work that has not actually finished, or to skip re-launching a task that still needs to run.
**Real-world analogy.** Like a shipping tracker that marks a package "delivered" because it found "order 5" as a substring in order 55's delivery confirmation - the wrong package is marked done.
**Severity.** Clean up eventually

### TD-276 - A specially crafted event name could write files outside the intended log folder
**What it is.** The in-session probe hook names log files using a value it receives from the environment without checking whether that value contains a folder separator character. A value like "Stop/evil" would cause the file to be written one directory level deeper than intended, creating unexpected sub-folders.
**Why it matters.** Although the path is still technically inside the probe directory, creating unintended sub-folders breaks log rotation, cleanup scripts, and any tooling that expects a flat file layout.
**Real-world analogy.** Like a hotel key card system that accepts room numbers as free text - a guest entering "101/manager" could end up with access to both room 101 and the manager's floor.
**Severity.** Clean up eventually

### TD-277 - A completion signal can be sent twice in certain error conditions
**What it is.** When a subprocess (a helper program) fails to start, two different error-handling paths both try to report the result at the same time. In JavaScript, once a result has been reported the second report is silently dropped, but the underlying race condition is fragile and could behave unexpectedly if the code is modified.
**Why it matters.** While currently harmless (JavaScript discards the second signal), the race condition makes the code brittle - a future change to error handling could turn the duplicate signal into a real bug.
**Real-world analogy.** Like two customer-service agents both calling the same customer to confirm the same order cancellation - usually one just gets voicemail, but if the customer answers both calls they might cancel two orders instead of one.
**Severity.** Clean up eventually

### TD-278 - Inline-event detector misses onclick handlers that appear after the first closing angle bracket in a tag
**What it is.** The tool that scans HTML for inline event handlers (code written directly into page elements) uses a pattern that stops reading as soon as it hits the first ">" character. A tag that uses ">" inside a quoted attribute value before the onclick handler would cause the handler to be missed.
**Why it matters.** Journey-coverage reports would undercount inline handlers, giving an overly optimistic picture of how thoroughly user interactions are tracked.
**Real-world analogy.** Like a building code inspector who stops reading a floor plan at the first staircase symbol and misses any fire exits drawn after it.
**Severity.** Clean up eventually

### TD-279 - Browser-storage test cleanup can never actually run from the command line
**What it is.** The automated test-data cleanup system has an adapter for clearing browser local storage (data stored in the browser between sessions). Cleaning browser storage requires an active browser session. The command-line cleanup tool never provides one, so every browser-storage cleanup entry is silently marked "skipped" instead of actually being removed.
**Why it matters.** Test data tagged for browser-storage cleanup accumulates indefinitely when cleanup is run from the command line, potentially polluting test environments over time.
**Real-world analogy.** Like a cleaning crew that is assigned to wipe whiteboards but only works when the office is open - any boards scheduled for overnight cleaning are simply left untouched with a "skipped" note.
**Severity.** Clean up eventually

### TD-280 - A Windows metadata file is bundled into every published release of the npm package
**What it is.** A Windows-generated system file called "desktop.ini" (used by Windows Explorer to customize folder appearance) was accidentally committed to the repository. It is excluded from the project's ignore list on paper, but because it was committed before the ignore rule existed, git still tracks it and includes it in every npm package release.
**Why it matters.** The file slightly increases the published package size and looks unprofessional to anyone inspecting the package contents. It needs to be explicitly untracked to fix it.
**Real-world analogy.** Like a publisher who accidentally included a Post-it note from the author's desk in every printed copy of the book - harmless, but embarrassing and wasteful.
**Severity.** Clean up eventually

### TD-281 - A model-selection utility that is built, tested, but never actually used
**What it is.** There is a module designed to select which AI model tier to use for different tasks. It has tests and is listed in documentation, but no part of the actual tool imports or calls it. Model selection is instead done by hand in each workflow script separately.
**Why it matters.** The module gives a false impression of centralized model governance. Any update to model selection logic must be done manually in each workflow script rather than in one place.
**Real-world analogy.** Like a company that built a centralized HR system for assigning staff to projects, but every department manager still maintains their own spreadsheet and ignores the system.
**Severity.** Clean up eventually

### TD-282 - AI context summaries miss contracts referenced in task and constraint files
**What it is.** When preparing a briefing document for an AI worker, the tool looks for references to design contracts only in the main scope file. References to the same contracts inside the task list or the constraints file are never picked up.
**Why it matters.** The AI worker's briefing is incomplete - it may not know about relevant contracts, leading to outputs that violate agreed interfaces without any warning.
**Real-world analogy.** Like a project manager who briefs a contractor by reading only the project overview document, skipping the technical specifications and compliance requirements that were referenced in the task checklist.
**Severity.** Clean up eventually

### TD-283 - The help documentation for one command omits a file it actually reads
**What it is.** The help entry for the "backlog settings" command lists only one file it works with. In practice, three of its sub-commands also read the main backlog file - but that file is not mentioned in the help entry.
**Why it matters.** Anyone checking the help to understand which files might be locked or need backing up before running the command would have an incomplete picture.
**Real-world analogy.** Like a car service checklist that says "replace the oil filter" but does not mention it also requires draining the oil - the mechanic arrives with the filter but no drain pan.
**Severity.** Clean up eventually

### TD-284 - The "--top N" filter in backlog list accepts nonsensical values with no warning
**What it is.** The command for listing backlog items has a "show top N items" option. There is no validation that N is a positive whole number. Passing zero, a negative number, or a word produces undefined behavior.
**Why it matters.** A user or script passing an invalid value gets no error message and may receive confusing or empty results with no explanation.
**Real-world analogy.** Like a coffee machine with a cup-size dial that accepts positions beyond "large" - it may overflow, do nothing, or behave unpredictably, with no indicator that the setting is invalid.
**Severity.** Clean up eventually

### TD-285 - Two self-referential step instructions in the milestone-completion workflow
**What it is.** In the complete-milestone command document, one step says "proceed to Step 2" while the reader is already in Step 2. A second step references "Step 4" for a summary, but the summary is actually created in Step 5. Both are broken internal navigation instructions.
**Why it matters.** Anyone following the workflow manually or auditing it will be confused and may skip the correct next step or look for content in the wrong place.
**Real-world analogy.** Like a recipe that says "once the sauce is ready, proceed to Step 3" from inside Step 3 itself - the cook does not know whether to re-read the step or move on.
**Severity.** Clean up eventually

### TD-286 - The init guide references a step number that does not exist
**What it is.** In the project initialization command document, Step 12 refers the reader to "Step 7.6" for Playwright (browser testing tool) setup instructions. There is no Step 7.6; the actual Playwright setup is in Step 11.
**Why it matters.** Anyone following the init guide to verify test infrastructure setup will not find Step 7.6 and may assume setup was skipped or that the guide is out of date.
**Real-world analogy.** Like an assembly manual that says "refer to diagram 7.6" when the manual only goes up to diagram 7.4 - the assembler stops, confused, unsure whether they missed a page.
**Severity.** Clean up eventually

### TD-287 - Re-running the project setup on the same day silently overwrites the previous backup
**What it is.** When the init-scan-setup command finds an existing tech-debt file, it archives it with only the date in the filename (no time). If the command is run twice in one day, the second run writes over the first archive without warning.
**Why it matters.** A user who re-runs setup to try different settings loses the first archive permanently, with no indication it was overwritten.
**Real-world analogy.** Like a document management system that saves backups named only by date - running "backup" twice on Tuesday overwrites Tuesday's first backup with no version history.
**Severity.** Clean up eventually

### TD-288 - The update-available banner shows the current version twice instead of old and new
**What it is.** When an auto-update fails and the tool displays a notice, the banner is supposed to show "current version - update available: new version." Instead it shows the current version in both positions, making the message read "v4.0.12 - update available (v4.0.12 - v4.0.13)" - the installed version appears twice.
**Why it matters.** The redundant display is confusing and looks like a bug to the user; it reduces confidence in the update mechanism.
**Real-world analogy.** Like a software update dialog that reads "You are running version 12. Update to version 12 (latest: 13)?" - technically correct but clearly something is wrong.
**Severity.** Clean up eventually

### TD-289 - Preflight check reads the entire task history file into memory every time it runs
**What it is.** Every time the tool runs its startup preflight check, it reads the complete history of all tasks ever recorded (a file that grows with every milestone) into memory all at once. It then only uses the last 10 records. There is no limit on how large this file can grow.
**Why it matters.** On a long-running project with many milestones, this file could become very large, causing a noticeable delay on every tool invocation even for simple commands.
**Real-world analogy.** Like a cashier who, before ringing up each customer, reads the entire transaction log going back to the store's opening day just to find yesterday's last ten receipts.
**Severity.** Clean up eventually

### TD-290 - Git commands are assembled using string substitution - unusual branch names could cause unintended behavior
**What it is.** The tool builds git command strings by inserting branch names and dates directly into the command text using quoted substitution. While the quoting protects against simple cases, a branch name containing embedded quotes or special characters could break out of the intended command structure.
**Why it matters.** In practice, branch names follow predictable conventions so this is very unlikely to be exploited. However, the pattern is a known security anti-pattern and should use argument arrays instead of string assembly.
**Real-world analogy.** Like a receptionist who reads a visitor's name aloud to unlock a voice-activated door - works fine for "John Smith" but breaks if a visitor says their name is 'John" open all doors Smith'.
**Severity.** Clean up eventually

### TD-291 - 33 leftover workspace folders from completed milestones were never cleaned up
**What it is.** After a milestone is completed and archived, the GSD-T tool is supposed to remove the working directories it created for that milestone. Milestones M43 through M65 were all archived successfully, but their 33 working directories are still sitting in the active workspace folder.
**Why it matters.** The clutter makes it harder to find which domains belong to the current active milestone. Any tooling that counts or lists active domains gets inflated numbers.
**Real-world analogy.** Like a project management board where completed sprint sticky notes are moved to the "done" column but never physically removed - after a year the board is covered in old notes and the active sprint is hard to find.
**Severity.** Clean up eventually

### TD-292 - The contract document for the background supervisor describes a system that no longer exists
**What it is.** There is a 639-line contract document defining how the unattended background supervisor should work. The actual code it describes was deleted in a previous milestone (M61). The document still refers to deleted files and describes behaviors that have since been replaced by a completely different mechanism.
**Why it matters.** Any developer or AI agent reading this contract to understand how unattended mode works will follow outdated specifications, potentially rebuilding the old system instead of working with the current one.
**Real-world analogy.** Like an operations manual that still describes how to operate machinery that was replaced three years ago - it looks authoritative, but following it would mean working on equipment that no longer exists.
**Severity.** Clean up eventually

### TD-293 - Project status documents still point to a retired tracking file
**What it is.** Two official project guideline documents ("contracts" - written agreements about how parts of the system work) still reference a specific status file that was planned for deletion during a previous cleanup effort but was never actually removed.
**Why it matters.** When the team follows these outdated documents, they may build new features that depend on a file that no longer exists or should not exist - leading to broken features or wasted rework when the cleanup eventually happens.
**Real-world analogy.** Your office policy manual still tells employees to file expense reports in the "red folder bin" in room 204, but that bin was removed during last year's office reorganization - nobody updated the manual, so new hires keep going to an empty corner looking for something that isn't there.
**Severity.** Clean up eventually

