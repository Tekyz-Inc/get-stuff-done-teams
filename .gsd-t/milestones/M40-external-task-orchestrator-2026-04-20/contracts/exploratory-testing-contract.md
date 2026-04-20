# Contract: Exploratory Testing (Evaluator Interactivity)

## Owner
Domain: evaluator-interactivity

## Consumers
- `commands/gsd-t-execute.md` — QA and Red Team subagent prompts
- `commands/gsd-t-quick.md` — inline QA
- `commands/gsd-t-integrate.md` — integration QA and Red Team
- `commands/gsd-t-debug.md` — debug verification

## Activation Condition

Exploratory testing is activated ONLY when Playwright MCP is registered in Claude Code settings.

**Detection method**: Check for `playwright` in Claude Code MCP configuration (typically `~/.claude/settings.json` or `.claude/settings.local.json` under `mcpServers`).

If Playwright MCP is not found → skip exploratory block entirely (silent, no errors).

## Protocol: Ordering

```
1. All scripted tests run (unit + E2E)
2. Scripted tests MUST pass
3. [Only if scripted tests pass AND Playwright MCP available] → exploratory phase begins
4. QA exploratory: 3 minutes
5. Red Team exploratory: 5 minutes
6. Findings appended to reports
```

Exploratory testing is never a substitute for scripted tests. It is additive.

## Time Budgets

| Agent     | Budget    | Scope                              |
|-----------|-----------|------------------------------------|
| QA        | 3 minutes | Happy-path variations, edge inputs |
| Red Team  | 5 minutes | Adversarial flows, race conditions |

## Finding Format

All exploratory findings must be tagged `[EXPLORATORY]` in reports:

**In `.gsd-t/qa-issues.md`:**
```
| Date | Command | Step | Model | Duration(s) | Severity | Finding |
| {date} | {cmd} | Step {N} | {model} | {s}s | {severity} | [EXPLORATORY] {finding description} |
```

**In `.gsd-t/red-team-report.md`:**
```
## [EXPLORATORY] {finding title}
**Severity**: {LOW|MEDIUM|HIGH|CRITICAL}
**Reproduced**: {yes/no — must be yes to count}
**Steps**: {reproduction steps using Playwright MCP}
**Finding**: {what was discovered}
```

## QA Calibration Integration

Exploratory findings feed into M31 QA calibration as a separate category:

- Category key: `exploratory`
- These findings do NOT count against the scripted test pass/fail ratio
- They are tracked separately in `.gsd-t/metrics/task-metrics.jsonl` with `source: "exploratory"`
- Historical: the M31 `qa-calibration-contract.md` defined the `exploratory` signal type; that contract was deleted in M38 along with the self-improvement loop. The `source: "exploratory"` marker on task-metrics records is the surviving discriminator.

## Prompt Block Template

The following block is injected into QA/Red Team subagent prompts when Playwright MCP is available:

```
## Exploratory Testing (if Playwright MCP available)

After all scripted tests pass:
1. Check if Playwright MCP is registered in Claude Code settings (look for "playwright" in mcpServers)
2. If available: spend {budget} minutes on interactive exploration using Playwright MCP
   - Try variations of happy paths with unexpected inputs
   - Probe for race conditions, double-submits, empty states
   - Test accessibility (keyboard navigation, screen reader flow)
3. Tag all findings [EXPLORATORY] in your report
4. If Playwright MCP is not available: skip this section silently
```

## Backward Compatibility

- Commands without the exploratory block produce identical behavior to pre-M32
- Commands with the block behave identically when Playwright MCP is absent (silent skip)
- No breaking changes to existing QA/Red Team report formats
