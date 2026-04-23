# M44-D8 — Constraints

## Hard rules

1. **Writer derives, never decides** — plan content is a deterministic projection of `.gsd-t/partition.md` + `.gsd-t/domains/*/tasks.md`. The writer must NOT call an LLM, must NOT use TodoWrite-driven heuristics, must NOT prompt for input. If derivation can't produce a plan (e.g., no partition file), write `{tasks: [], note: "no-partition"}` and continue — never block the spawn.

2. **Spawn must launch even if writer fails** — wrap `writeSpawnPlan` calls in try/catch in all three chokepoints. Plan-write failure is an observability gap, not a spawn-blocking error. Log to stderr, continue.

3. **Atomic writes only** — temp file + rename. No partial JSON ever visible to the reader. The post-commit hook reads these concurrently.

4. **Post-commit hook must stay silent-fail** — if `node` is missing, if `.gsd-t/spawns/` doesn't exist, if a plan file is malformed: log to stderr, exit 0. Never break the user's commit.

5. **No new LLM token cost** — see scope.md "Token cost" section. Reader and writer are pure I/O. Status updater is shell + node.

6. **Additive edits to existing files only** — `bin/gsd-t-token-capture.cjs`, `bin/headless-auto-spawn.cjs`, `scripts/gsd-t-dashboard-server.js`, `scripts/gsd-t-transcript.html`, `commands/gsd-t-resume.md` get net-new code blocks; do NOT rewrite existing logic. Token-log header, envelope parsing, SSE transcript stream, headless contract — all unchanged.

7. **Dashboard endpoint additive** — `/api/spawn-plans` is new; do NOT change existing `/api/token-breakdown`, `/api/transcript`, or any current SSE channel.

8. **Renderer panel must not duplicate the transcript** — the panel answers "task list status" only. Per-tool-call detail belongs in the transcript stream that already exists.

9. **No transcript-derivation fallback** — even if the plan file is missing, do NOT attempt to reconstruct a plan by reading the transcript. The panel either renders from a real plan file or shows "no active spawn plan." Half-measures are forbidden (per user feedback 2026-04-22).

10. **Disjoint with D1-D7** — D8 must not touch any file owned by D1-D7. The chokepoint additions to `bin/gsd-t-token-capture.cjs` and `bin/headless-auto-spawn.cjs` are net-new function calls only.

## Format rules

- Plan files: `.gsd-t/spawns/{spawnId}.json` — spawnId is filesystem-safe (alphanumerics + `-` + `_` only)
- Active = `endedAt === null`
- Status icons: `☐` pending, `◐` in_progress, `✓` done — the only three states
- Only ONE task per spawn may be `in_progress` at a time
- Tokens field on tasks: `null` when pending/in_progress, `{in, out, cr, cc, cost_usd}` when done with attribution match, `null` when done without match (renders as `—`)
- Token cell format in renderer: `in=Nk out=Nk $X.XX` (k-suffix above 1000, 2-decimal USD), right-aligned, monospace

## Mode contract reminders (from M44 partition)

- **[unattended]** mode: zero compaction, supervisor orchestrates. D8 writer must run inside the worker process, not the supervisor.
- **[in-session]** mode: never throw an interactive pause. D8 writer failure must be silent-fail (rule 2).
