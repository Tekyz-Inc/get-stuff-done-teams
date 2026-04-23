# Tasks: m45-d2-in-session-conversation-capture

Wave: **1** (parallel with m45-d1-viewer-route-fix; file-disjoint).

## T-1: Write the conversation-capture hook

- [ ] Create `scripts/hooks/gsd-t-conversation-capture.js`.
- [ ] Read stdin as JSON (same pattern as `scripts/hooks/gsd-t-in-session-usage-hook.js`). Dispatch on `hook_event_name`.
- [ ] For SessionStart: resolve `session_id` from payload; write nothing (session_start is implicit via the first user_turn) — OR optionally write a synthetic `session_start` frame with `ts` only.
- [ ] For UserPromptSubmit: append `{"type":"user_turn","ts":"<iso>","session_id":"<id>","content":"<prompt>","message_id":"<id>"}` to `.gsd-t/transcripts/in-session-{sessionId}.ndjson`.
- [ ] For Stop: append `{"type":"assistant_turn","ts":"<iso>","session_id":"<id>","content":"<assistant-final>","message_id":"<id>"}`. If final message is unavailable in the payload, write a stub with `ts` only.
- [ ] For PostToolUse (optional, guarded behind `GSD_T_CAPTURE_TOOL_USES=1` env to keep writes small by default): append one `tool_use` frame per call with a summary (`{name, duration_ms, tool_use_id}`). Skip for now if it complicates testing — first land SessionStart/UserPromptSubmit/Stop, add PostToolUse in a follow-up.
- [ ] Cap `content` at 16 KB with `{..., truncated: true}` marker when exceeded.
- [ ] Never throw to the caller — catch all errors, log to stderr, exit 0.

**Touches**: `scripts/hooks/gsd-t-conversation-capture.js` (new).
**Depends on**: —
**Estimate**: medium.

## T-2: Write the conversation-capture contract

- [ ] Create `.gsd-t/contracts/conversation-capture-contract.md` v1.0.0.
- [ ] Document: frame schema (type enum, ts format, session_id semantics, content cap, message_id), file-naming (`in-session-{sessionId}.ndjson`), hook entry points (SessionStart / UserPromptSubmit / Stop / optional PostToolUse), session-id source (from Claude Code hook payload, fallback to pid+startedAt hash).
- [ ] Document the contract between the hook and the viewer: the left-rail discriminator is the filename prefix `in-session-`.
- [ ] Document the contract between the hook and the compact-detector: the detector's fallback path (T-4) must write to the most-recently-modified `in-session-*.ndjson` when no spawn NDJSON is more recent.

**Touches**: `.gsd-t/contracts/conversation-capture-contract.md` (new).
**Depends on**: T-1 (schema crystallizes during T-1 implementation).
**Estimate**: small.

## T-3: Extend the viewer left-rail labeling

- [ ] In `scripts/gsd-t-transcript.html`, find the left-rail tree renderer (around line 452 — `byId.set(s.spawnId, ...)`).
- [ ] When a spawn-index row's filename (or a new `type` field if the server provides one) starts with `in-session-`, prefix the label with `💬 conversation` instead of the default `▶ spawn`.
- [ ] Choose the approach:
  - **Front-end-only**: the viewer detects the prefix from `spawnId` (if spawn-id == filename-stem) or from the `command` field.
  - **Back-end-aware**: extend `/api/spawns-index` (owned by `scripts/gsd-t-dashboard-server.js` — D1 territory) to emit a `type` field.
- [ ] Prefer front-end-only. Grep first: if `spawnId` already equals the NDJSON stem, a single `if (spawnId.startsWith('in-session-'))` check on the client suffices.
- [ ] Add CSS: `.label-in-session { color: var(--yellow); }` or similar muted accent.

**Touches**: `scripts/gsd-t-transcript.html` (additive — DOM label + CSS).
**Depends on**: T-1 (need an actual in-session NDJSON on disk to manually verify).
**Estimate**: small.

## T-4: Extend the compact-detector fallback target

- [ ] In `scripts/gsd-t-compact-detector.js`, find the target-selection block (~line 160–200) where it picks the most-recently-modified NDJSON.
- [ ] Keep the existing spawn-NDJSON preference. Add a fallback: if no spawn-NDJSON has been modified within the last N seconds (say 30) AND an `in-session-*.ndjson` exists that IS fresh, target that file instead.
- [ ] The `compact_marker` frame shape is locked — D2 does NOT change it.
- [ ] Log the decision to stderr (`compact-detector: targeting in-session-{sessionId}.ndjson (fallback)`) so regressions are obvious.

**Touches**: `scripts/gsd-t-compact-detector.js`.
**Depends on**: T-1 (need in-session NDJSON on disk for the fallback to find).
**Estimate**: small.

## T-5: Wire the hook in `templates/CLAUDE-global.md`

- [ ] Grep `templates/CLAUDE-global.md` for the existing SessionStart / UserPromptSubmit / Stop / PostToolUse hook block (it wires `gsd-t-in-session-usage-hook.js` today).
- [ ] Add a parallel hook entry pointing at `scripts/hooks/gsd-t-conversation-capture.js`. Both hooks can coexist — Claude Code allows multiple hooks per event.
- [ ] Note in the block: this hook captures *content* (not just tokens).
- [ ] Do NOT edit `~/.claude/settings.json` directly — the template is the source of truth; users install/update via the CLI.

**Touches**: `templates/CLAUDE-global.md`.
**Depends on**: T-1 (hook script path must exist first).
**Estimate**: trivial.

## T-6: Tests

- [ ] `test/m45-d2-conversation-capture.test.js`: feed synthetic SessionStart / UserPromptSubmit / Stop payloads via stdin; assert frames land in the expected NDJSON at the expected path, with the expected schema.
- [ ] `test/m45-d2-compact-detector-in-session-fallback.test.js`: create a tmp dir with ONLY an `in-session-*.ndjson` (no spawn NDJSON); invoke the detector's target-selection; assert it picks the in-session file.
- [ ] `test/m45-d2-transcript-left-rail-in-session.test.js`: load the viewer HTML in a minimal DOM shim (jsdom or a regex test), seed a fake spawn-index response with one `in-session-*` entry and one regular spawn entry, assert the rendered labels carry the correct badges.

**Touches**: 3 new test files.
**Depends on**: T-1, T-3, T-4.
**Estimate**: medium.

## T-7: Manual smoke test

- [ ] Restart a fresh Claude Code session in this repo so SessionStart fires with the new hook wired.
- [ ] Type a short prompt; exit. Confirm `.gsd-t/transcripts/in-session-{sessionId}.ndjson` exists with `user_turn` + `assistant_turn` frames.
- [ ] Start dashboard; visit `/transcripts`. Confirm the new entry appears in the left rail with the `💬 conversation` label.
- [ ] (Optional) Simulate a compaction via the existing test harness; confirm `compact_marker` lands in the in-session NDJSON.

**Touches**: runtime only.
**Depends on**: T-1 through T-5.
**Estimate**: trivial.

## Done when

- All D2 tests pass.
- Full suite stays green.
- Manual smoke confirms the in-session transcript shows up in the viewer.
- Progress.md Decision Log entries added.
