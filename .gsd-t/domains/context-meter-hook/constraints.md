# Constraints: context-meter-hook

## Must Follow

- **Zero external dependencies**: Node.js built-ins only. HTTP calls use the `https` module — no axios, node-fetch, anthropic SDK.
- **Hook latency budget < 200ms** end-to-end (transcript read → API call → response). The hook blocks Claude Code's tool loop.
- **Async HTTP with timeout**: `count_tokens` request must have a hard timeout (default 2s). On timeout, return `{}` (no additionalContext) so the tool loop is never blocked by a hung API.
- **Graceful degradation**: If API key missing, transcript unreadable, API call fails, or response malformed → return `{}` silently. Log diagnostic to `.gsd-t/context-meter.log` for `gsd-t doctor` to surface, but NEVER block Claude's tool loop.
- **Check frequency honored**: Read `checkFrequency` from config (default: every 5th tool call). Maintain a counter in `.gsd-t/.context-meter-state.json` to skip intermediate invocations.
- **Respect configured threshold**: Default 75%, overridable via config. Compare `input_tokens` from count_tokens response against `modelWindowSize` (default 200000 for Opus/Sonnet 4.6).
- **additionalContext format**: When threshold exceeded, return exactly:
  ```json
  { "additionalContext": "⚠️ Context window at {PCT}% of {MAX}. Run /user:gsd-t-pause to checkpoint and clear before continuing." }
  ```
- **Follow CLAUDE.md Prime Directives**: minimal change, no refactors, no speculative features.
- **Test coverage**: Every exported function in helper modules MUST have unit tests with mocked fs and https.

## Must Not

- Import any npm package (including transitively via helpers).
- Write to settings.json, bin/gsd-t.js, or any file owned by another domain.
- Reference `CLAUDE_CONTEXT_TOKENS_USED` or `CLAUDE_CONTEXT_TOKENS_MAX` environment variables — these never work and are being removed from the codebase.
- Call `/v1/messages` (actual completion endpoint) — only `/v1/messages/count_tokens` (free tier, no billing).
- Hard-code model window sizes — always read from config (with sensible default).
- Store the API key in any file — read from env var named by config (default `ANTHROPIC_API_KEY`).
- Log API responses containing message content — only log token counts and status codes (avoid leaking prompt content to logs).
- Block Claude's tool loop waiting on the API. Fail open, always.

## Must Read Before Using

- **Claude Code transcript format** (`~/.claude/projects/{project-slug}/{session-id}.jsonl`): read at least one real session file and document the JSONL line shape (role, content, tool_use, tool_result pairing) in a doc comment at the top of `transcript-parser.js`. Do NOT treat the format as a black box — it is undocumented upstream and may vary between Claude Code versions.
- **Anthropic `count_tokens` API**: read the request/response schema from the Anthropic docs (`/v1/messages/count_tokens`). Required headers: `x-api-key`, `anthropic-version: 2023-06-01`, `content-type: application/json`. Response: `{ "input_tokens": number }`.
- **Existing `bin/token-budget.js`**: read the `getSessionStatus()` signature (per `token-budget-contract.md`). This hook's output feeds that function, so the state format must match what `token-budget-replacement` expects.
- **Existing PostToolUse hook examples in `~/.claude/settings.json`** (if any): read current hook shape so the installer integration knows what to merge.

## Dependencies

- **Depends on**: `context-meter-config` for the config file schema (read-only).
- **Depended on by**: `token-budget-replacement` (reads hook output state for `getSessionStatus()`), `installer-integration` (installs the hook into settings.json, doctor checks hook is wired).
