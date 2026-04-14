# Domain: context-meter-config

## Responsibility

Define the configuration file schema for the context meter, provide the default config, and implement a config loader with validation + schema migration. Owns the single source of truth for threshold, model window size, check frequency, and API key env var name.

## Owned Files/Directories

- `.gsd-t/context-meter-config.json` — runtime config file (created in downstream projects by installer)
- `templates/context-meter-config.json` — default config shipped with the package
- `bin/context-meter-config.cjs` — loader module: read + validate + fall back to defaults (CommonJS so it runs in ESM projects)
- `bin/context-meter-config.test.cjs` — unit tests: schema validation, default fallback, invalid-value handling
- `.gsd-t/contracts/context-meter-contract.md` — new contract defining the config schema and the hook→consumer state file format

## NOT Owned (do not modify)

- `scripts/gsd-t-context-meter.js` — owned by context-meter-hook domain (reads config, doesn't write it)
- `bin/gsd-t.js` — owned by installer-integration domain (copies template on install, reads config for doctor)
- `bin/token-budget.js` — owned by token-budget-replacement domain (reads hook state file, not config)
- `.gsd-t/contracts/token-budget-contract.md` — owned by token-budget-replacement domain (related but separate)
