# GSD-T: Setup — Generate or Restructure Project CLAUDE.md

You are generating or restructuring the project-level CLAUDE.md for the current project. The goal is a well-structured file that complements the global `~/.claude/CLAUDE.md` without duplicating it.

## Step 1: Read Global Context

Read `~/.claude/CLAUDE.md` to understand what's already covered globally:
- Prime Directives
- GSD-T workflow, commands, living documents
- Versioning, Destructive Action Guard, Pre-Commit Gate
- Autonomous Execution Rules, Workflow Preferences defaults
- Code Standards defaults

**Rule**: Anything in the global file should NOT be repeated in the project file. The project file only contains project-specific information and overrides.

## Step 2: Scan the Project

Gather as much as possible automatically:

### 2a: Project Identity
- Project name from `package.json`, `pyproject.toml`, `go.mod`, `Cargo.toml`, repo name, or directory name
- Description from package manifest or README

### 2b: Tech Stack Detection
Scan for and identify:
- **Language**: from file extensions, configs (`tsconfig.json`, `pyproject.toml`, `go.mod`, etc.)
- **Framework**: from dependencies (`package.json`, `requirements.txt`, `Pipfile`, etc.)
- **Database**: from dependencies, config files, docker-compose, `.env` vars
- **Frontend**: from dependencies, directory structure (`client/`, `src/components/`)
- **Testing**: from test configs (`vitest.config`, `pytest.ini`, `jest.config`, etc.)
- **Deployment**: from `Dockerfile`, CI/CD configs, cloud configs

### 2c: Project Structure
- Scan directories to build "Where Things Live" table
- Identify key entry points, config files, and module boundaries

### 2d: Existing Conventions
- **Naming**: Sample 5-10 files and functions to detect naming patterns (snake_case, camelCase, kebab-case, PascalCase)
- **File organization**: Flat, feature-based, layer-based?
- **Import style**: Absolute, relative, aliases?

### 2e: Existing Documentation
- Check for `docs/` directory and which living documents exist
- Check for `.gsd-t/` directory (already initialized?)
- Check for `.env.example` or environment docs

### 2f: Git State
- Current branch (for Branch Guard)
- Remote URL (for reference)

## Step 3: Check Existing CLAUDE.md

### If CLAUDE.md exists:

Read it and categorize every section:

1. **Project-specific (KEEP)**: Overview, Tech Stack, Branch Guard, Where Things Live, Conventions, Testing, Environment Variables, Deployed URLs, Reference Projects, project-specific "Don't Do" rules
2. **Global duplicate (REMOVE)**: Anything that duplicates the global CLAUDE.md — Prime Directives, GSD-T workflow descriptions, Destructive Action Guard (unless project-specific additions), Pre-Commit Gate, Autonomous Execution Rules
3. **GSD/legacy sections (MIGRATE)**: `## GSD Workflow Preferences` or similar → extract project-specific preferences into `## Workflow Preferences` using the new format
4. **Stale content (FLAG)**: Sections that reference outdated tech, removed features, or incorrect paths

Present findings to user:
```
CLAUDE.md Analysis:
  KEEP:    {N} project-specific sections
  REMOVE:  {N} sections that duplicate global CLAUDE.md
  MIGRATE: {N} GSD sections → Workflow Preferences format
  FLAG:    {N} potentially stale sections
```

### If no CLAUDE.md exists:

Note: "No existing CLAUDE.md — will generate from scratch."

## Step 4: Ask Targeted Questions

Only ask what could NOT be auto-detected. Skip questions where the answer is already clear from scanning.

**Potential questions** (ask only if not auto-detected):

1. **Branch Guard**: "Which branch should commits target?" (skip if only `main` or `master` exists)
2. **Autonomy Level**: "What autonomy level? Level 1 (Supervised), Level 2 (Standard), Level 3 (Full Auto — default)" (skip if existing CLAUDE.md already declares it)
3. **Workflow Preferences**: "Any overrides to the global defaults? (Research Policy, Phase Flow)" (skip if user has no overrides)
4. **Deployed URLs**: "Production, staging, and local URLs?" (skip if found in .env or existing docs)
5. **Project-specific rules**: "Any 'never do' rules specific to this project?" (skip if existing CLAUDE.md already has them)

**Do NOT ask about**:
- Tech stack (auto-detected)
- Naming conventions (auto-detected)
- Testing framework (auto-detected)
- File structure (auto-detected)
- Anything already covered by the global CLAUDE.md

## Step 5: Generate CLAUDE.md

Build the file using this structure. Include only sections that have real content — omit empty sections entirely.

```markdown
# {Project Name}

## Branch Guard
**Expected branch**: {branch}

## Project Overview
{Brief description — what problem does this solve and for whom?}

### Architecture
{High-level architecture summary if the project has one — e.g., "Three-tier WebSocket bridge" with a diagram. Keep it concise. Details belong in docs/architecture.md}

## Where Things Live

| Need to find... | Look here |
|-----------------|-----------|
| {component} | {path} |

## Key Technologies
{Bulleted list of language, framework, database, testing, etc.}

## Documentation
- Requirements: docs/requirements.md
- Architecture: docs/architecture.md
- Workflows: docs/workflows.md
- Infrastructure: docs/infrastructure.md

## Autonomy Level
**Level {N} — {Name}** ({description})  <!-- default: Level 3 — Full Auto -->

## Workflow Preferences
<!-- Override global defaults. Delete what you don't need to override. -->

### Research Policy
{project-specific overrides, or omit section}

### Phase Flow
{project-specific overrides, or omit section}

## Testing
{Framework, file organization, naming, running instructions}

## Code Patterns to Follow
{Project-specific conventions that differ from or extend global defaults}

### Naming Conventions
{If different from global defaults}

## Running the App
{Dev server, build commands, first-time setup}

## Environment Variables
| Variable | Purpose | Default |
|----------|---------|---------|
| {VAR} | {purpose} | {default} |

## Deployed URLs
- **Production**: {url}
- **Staging**: {url}
- **Local**: http://localhost:{port}

## Don't Do These Things
{Project-specific rules only — don't repeat global rules}

## GSD-T Workflow
This project uses contract-driven development.
- State: .gsd-t/progress.md
- Contracts: .gsd-t/contracts/
- Domains: .gsd-t/domains/

## Current Status
See `.gsd-t/progress.md` for current milestone/phase state.
```

### Section Rules:
- **NEVER duplicate** global CLAUDE.md content (Destructive Action Guard, Pre-Commit Gate, Prime Directives, etc.)
- **ALWAYS include**: Branch Guard, GSD-T Workflow, Current Status
- **Include if relevant**: Where Things Live, Testing, Code Patterns, Environment Variables
- **Omit if empty**: Deployed URLs (if not deployed), Architecture (if trivial), Workflow Preferences (if no overrides)

## Step 6: Present and Confirm

Show the generated CLAUDE.md content to the user with a summary:

```
Generated CLAUDE.md for {Project Name}:
  Sections: {N} ({list of section names})
  Auto-detected: {tech stack, conventions, structure}
  From existing: {N} sections preserved
  Removed: {N} global duplicates

{Show the full generated content}

Write this as CLAUDE.md? (This will replace the existing file if one exists.)
```

Wait for user confirmation before writing.

## Step 7: Write and Verify

1. Write the CLAUDE.md file
2. Verify it's valid markdown (no broken tables, unclosed code blocks)
3. If `.gsd-t/progress.md` exists, log the setup in the Decision Log

## Document Ripple

### Always update:
1. **`.gsd-t/progress.md`** — Log "Project CLAUDE.md generated/restructured via gsd-t-setup" in Decision Log (if .gsd-t/ exists)

### Skip: No other files are affected by CLAUDE.md generation.

## Test Verification

No tests to run — this command produces a configuration file, not code.

$ARGUMENTS
