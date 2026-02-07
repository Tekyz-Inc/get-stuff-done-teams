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

Replace all "{Project Name}" with the actual project name (from package.json, README, or folder name).
Replace all "{Date}" with today date.
Fill every section with real findings. If a section has nothing (e.g., no cron jobs), write "None" instead of placeholder text.

$ARGUMENTS
