# M35 — `/advisor` Programmable API Findings

**Status**: RESOLVED — convention-based fallback required
**Date**: 2026-04-14
**Owner**: m35-model-selector-advisor Task 1
**Consumers**: m35-model-selector-advisor T2 (`bin/model-selector.js`), T3 (`bin/advisor-integration.js`), T4 (`.gsd-t/contracts/model-selection-contract.md`)

---

## Question

Does Claude Code's native `/advisor` tool expose a programmable API callable from a subagent prompt, or is it user-initiated only?

## API surface discovered

**None found.** As of v2.74.13 (current project GSD-T version) and the Claude Code surface observable to subagents in this session, there is **no programmable `/advisor` API**. Specifically:

1. **Slash commands are user-initiated in the interactive loop.** The `Skill` tool that launches slash commands is only available to the top-level interactive agent, not to Task subagents. A subagent cannot call `Skill: advisor` or any equivalent.
2. **`/advisor` does not appear in the user-invocable skills list.** The skills list surfaced in the session reminder block contains the GSD-T workflow commands (`/gsd-t-*`), utility commands (`/branch`, `/commit`, `/checkin`, `/claude-api`, `/security-review`, etc.), and Anthropic-provided skills (`/init`, `/statusline`, `/review`, `/insights`, `/team-onboarding`). No `/advisor` entry.
3. **No MCP resource exposes an "advisor" endpoint.** The Figma MCP server is the only MCP server in the current project — it exposes `mcp__figma__*` tools, none of which relate to model escalation or reasoning advice.
4. **There is no public Anthropic API primitive named "advisor".** The Anthropic SDK exposes `messages.create`, `messages.batch.*`, `beta.files.*`, `beta.count_tokens` — no `advisor` endpoint. Escalating to a more capable model is done by passing a different `model` ID to `messages.create`, not by calling a named advisory service.

## Invocation pattern

**Convention-based fallback.** Since no programmable API exists, `/advisor` integration becomes a **subagent prompt convention**: at declared escalation points, the orchestrator injects a block into the subagent prompt instructing the subagent to mentally (or via a nested Task subagent at a higher model tier) escalate before finalizing the decision. The orchestrator records whether the escalation was honored via a telemetry flag (`escalated_via_advisor: boolean`) on the per-spawn token record.

## Fallback block text (injected by `bin/advisor-integration.js` and command-file Model Assignment blocks)

```
## Escalation Hook — /advisor convention-based fallback

Before finalizing your answer for this phase, stop and consider:
1. Is this decision high-stakes? (architecture, contract design, security boundary, data-loss risk, cross-module refactor, adversarial QA verdict)
2. Would a more capable model produce a materially better answer?
3. Are you confident in the assumptions you're making?

If YES to any of the above, do ONE of the following:
- **Escalate internally**: spend an extra reasoning pass re-examining the decision from first principles. Document the re-examination in your output.
- **Spawn a nested opus subagent**: use the Task tool with `subagent_type: "general-purpose"` and include `model: opus` in the spawn to get a second opinion before committing to your answer.

Record in your output whether you escalated: set `ESCALATED_VIA_ADVISOR=true` or `ESCALATED_VIA_ADVISOR=false` on a line by itself near the end of your report. The orchestrator reads this line and writes it to `.gsd-t/token-metrics.jsonl` (`escalated_via_advisor` field).

This is the M35 fallback because Claude Code's native `/advisor` tool has no programmable API at subagent scope. When Anthropic ships a programmable advisor endpoint, `bin/advisor-integration.js` will be rewritten to call it directly and this prompt block will be retired.
```

## Impact on `bin/advisor-integration.js` design

The T3 implementation has **one path to implement initially**: the convention-based fallback. Specifically:

- `invokeAdvisor({question, context, projectDir})` → `{available: false, guidance: null, loggedMiss: true}` unconditionally (no programmable API path to branch on).
- The `loggedMiss: true` return causes the caller to append a `missed_escalation` record to `.gsd-t/token-log.md` (and later to `.gsd-t/token-metrics.jsonl` via the T3/TT-T3 token bracket).
- The function exists anyway so that a future rewrite (programmable API becomes available) can swap the body without touching callers. This is the seam.
- Tests cover: (a) fallback path returns the expected shape, (b) miss is logged to `.gsd-t/token-log.md`, (c) runtime unavailability (e.g. bad projectDir) does not throw — graceful degradation, (d) the returned `loggedMiss` flag matches actual file state.

## Impact on `bin/model-selector.js` (T2)

- `escalation_hook` field on sonnet-tier phase mappings is a **string containing the fallback block** (or a reference to a shared constant exporting it), not a callable or a URL.
- For haiku and opus phases, `escalation_hook` is `null` (haiku because it's mechanical — no judgment escalation makes sense; opus because it's already at the top tier).
- For sonnet phases where the declared risk is low (e.g. routine code changes in `gsd-t-execute` Step 2), `escalation_hook` can also be `null` — the convention block is only injected where the orchestrator has flagged a high-stakes sub-decision.

## Future work (M36+)

If Anthropic ships a programmable `/advisor` endpoint or MCP server:
1. Rewrite `bin/advisor-integration.js` to call it directly (the T3 seam is already in place).
2. Keep the convention-based fallback as a degraded mode for when the programmable API is unavailable at runtime.
3. Add a T3-equivalent task to the M36 milestone that sweeps command files to remove the convention block from spawn prompts where the programmable path is used.

No action required in M35 beyond shipping the fallback. This finding satisfies the "resolve the open question" acceptance criterion on m35-model-selector-advisor T1.
