# Domain: context-meter-hook

## Responsibility

Implement the `gsd-t-context-meter` PostToolUse hook script: read the active Claude Code transcript, reconstruct the messages array, call Anthropic's `count_tokens` endpoint, compare against the configured threshold, and emit `additionalContext` instructing Claude to run `/user:gsd-t-pause` when usage exceeds the threshold.

## Owned Files/Directories

- `scripts/gsd-t-context-meter.js` — PostToolUse hook entry point (Node.js, zero-dep; uses built-in `https` module)
- `scripts/gsd-t-context-meter.test.js` — unit tests: transcript parsing, count_tokens call mocking, threshold logic, additionalContext format
- `scripts/context-meter/` — helper modules (if decomposition needed)
  - `scripts/context-meter/transcript-parser.js` — reads `~/.claude/projects/{slug}/{session}.jsonl`, reconstructs messages array, handles tool_use/tool_result pairing
  - `scripts/context-meter/count-tokens-client.js` — thin `https.request()` wrapper for `/v1/messages/count_tokens`
  - `scripts/context-meter/threshold.js` — percentage calculation, threshold comparison, additionalContext builder

## NOT Owned (do not modify)

- `.gsd-t/context-meter-config.json` — owned by context-meter-config domain (this domain reads it, not writes it)
- `bin/gsd-t.js` — owned by installer-integration domain (hook installation, doctor check)
- `bin/token-budget.js` — owned by token-budget-replacement domain (rewrite to read real counts from this hook's output)
- `bin/task-counter.cjs` — owned by token-budget-replacement domain (retirement/removal)
- Command files (`commands/*.md`) — owned by token-budget-replacement + m34-docs-and-tests domains
