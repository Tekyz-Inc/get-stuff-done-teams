# GSD-T: Populate — Auto-Populate Documentation from Existing Codebase

Scan this codebase and populate the GSD-T documentation. Analyze the actual code — don't ask me questions.

## For docs/requirements.md:
- Scan routes/endpoints/UI to identify functional requirements (REQ-###)
- Scan package.json/requirements.txt/configs for technical requirements (TECH-###)
- Scan tests, configs, README for non-functional requirements (NFR-###)
- Cross-reference tests to populate the Test Coverage table

## For docs/architecture.md:
- Write a System Overview from the folder structure and entry points
- Document each major Component: purpose, location, dependencies, key methods
- Extract Data Models from schema files, migrations, or ORM models (fields, types, relationships, indexes)
- Document API Structure from route definitions (endpoints, methods, auth, request/response)
- Identify External Integrations from API clients, SDKs, env vars
- Note any Design Decisions found in comments, README, or ADR files

## For docs/workflows.md:
- Trace User Workflows from routes/handlers (registration, login, core features)
- Document Technical Workflows from cron jobs, queue workers, scheduled tasks
- Document API Workflows for complex multi-step operations
- Document Integration Workflows for any external system syncing

## For docs/infrastructure.md:
- Extract Quick Reference commands from package.json scripts, Makefile, README
- Document Local Development setup from README, docker-compose, .env.example
- Document Database commands from migrations, scripts, ORM config
- List Credentials and Secrets from .env.example (local) and any secret manager configs
- Document Deployment from CI/CD configs, Dockerfiles, cloud configs
- Document Logging and Monitoring from any logging setup or dashboard configs

## For .gsd-t/progress.md:
- Set Milestone 1: "Documentation Baseline"
- Set status: VERIFIED
- Log today session: "GSD-T documentation populated from existing codebase"

---

## Document Ripple

After populating all documentation, verify cross-references:

### Always update:
1. **`.gsd-t/progress.md`** — Set milestone and log the population session
2. **`CLAUDE.md`** — If it exists, verify it references all populated docs. If conventions were discovered during population, add them

### Check if affected:
3. **`.gsd-t/contracts/`** — If API or schema contracts exist, verify they match what was documented in architecture/requirements
4. **`.gsd-t/techdebt.md`** — If population revealed inconsistencies, missing tests, or debt, log items
5. **`README.md`** — If it exists, verify it's consistent with the populated docs. If not, update it

### Skip what's not affected.

## Test Verification

After populating documentation:

1. **Run existing tests**: Execute the full test suite to establish the current baseline
2. **Verify passing**: Document what passes and what fails — this is the project's test starting point
3. **Cross-reference**: Verify that test files mentioned in `docs/requirements.md` Test Coverage table actually exist and pass

---

Replace all "{Project Name}" with the actual project name (from package.json, README, or folder name).
Replace all "{Date}" with today date.
Fill every section with real findings. If a section has nothing (e.g., no cron jobs), write "None" instead of placeholder text.

$ARGUMENTS
