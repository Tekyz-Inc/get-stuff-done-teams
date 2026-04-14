# Constraints: context-meter-config

## Must Follow

- **Zero external dependencies**: Node.js built-ins only (`fs`, `path`). No `ajv`, no `zod`, no schema libs — write validation as plain functions.
- **CommonJS (`.cjs`)**: loader must run inside projects that declare `"type": "module"` in package.json. Follow the precedent from `bin/task-counter.cjs` and `bin/archive-progress.cjs`.
- **Backward-compatible defaults**: every field has a sensible default; a missing or partial config must not break the hook.
- **Schema versioning**: config file has a `version` field (start at `1`). Loader rejects unknown major versions with a clear error pointing to `gsd-t doctor`.
- **Validation rules**:
  - `thresholdPct`: 0 < n < 100 (default 75)
  - `modelWindowSize`: integer > 0 (default 200000)
  - `checkFrequency`: integer ≥ 1 (default 5)
  - `apiKeyEnvVar`: non-empty string (default `"ANTHROPIC_API_KEY"`)
  - `statePath`: relative path under `.gsd-t/` (default `".gsd-t/.context-meter-state.json"`)
- **No API key storage**: the config file stores the **env var name**, never the key itself. Loader must reject any config that contains a field matching `apiKey`, `api_key`, `ANTHROPIC_API_KEY`, or a 64+ character hex-ish string (basic leak prevention).

## Must Not

- Store the actual API key in config or any committed file.
- Add npm dependencies (including `dotenv`).
- Write config at hook runtime — config is read-only from the hook's perspective. Only the installer writes it.
- Break existing projects on upgrade — if config is absent, loader returns defaults silently.

## Must Read Before Using

- **Existing config precedent**: read `.gsd-t/task-counter-config.json` shape (if present) and `bin/task-counter.cjs` config loader section to match the existing style.
- **`bin/gsd-t.js` template-copy mechanism**: understand how other templates get copied into downstream projects on `gsd-t init` and `gsd-t update`.

## Dependencies

- **Depends on**: none (this is a leaf domain).
- **Depended on by**: `context-meter-hook` (reads config at runtime), `installer-integration` (copies template on install, reads config for doctor check), `token-budget-replacement` (reads config to learn the state file path).
