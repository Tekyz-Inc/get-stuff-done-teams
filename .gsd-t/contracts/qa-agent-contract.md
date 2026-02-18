# QA Agent Contract

## Spawn Interface
Every command that spawns the QA agent must provide:
```
Teammate "qa": {instructions from gsd-t-qa.md, scoped to current phase}
```

## Input (what the QA agent receives)
- `.gsd-t/contracts/*.md` — all contract definitions
- Test directory path (detected from playwright.config.* or package.json)
- Current phase context: "partition" | "plan" | "execute" | "test-sync" | "verify" | "quick" | "debug" | "integrate" | "complete"

## Output (what the QA agent produces)
Per phase:
| Phase | Output |
|-------|--------|
| partition | Contract test skeleton files (one per contract) |
| plan | Acceptance test scenario files |
| execute | Test execution results + new edge case tests |
| test-sync | Contract-test alignment report + gap fills |
| verify | Full test audit report (contract tests + coverage gaps) |
| quick | Regression/feature tests for the quick change |
| debug | Regression test for the bug being fixed |
| integrate | Cross-domain integration test results |
| complete | Final gate report: all-green or blocking gaps |

## Communication
- QA agent reports to lead via teammate message
- Format: `QA: {pass|fail} — {summary}. {N} contract tests, {N} passing, {N} failing.`
- If failing: include list of failing test names and which contract they map to

## Blocking Rules
- QA agent failure BLOCKS phase completion
- Lead cannot proceed until QA reports pass (or user overrides)

Owner: qa-agent-spec domain
Consumers: command-integration domain (all 10 commands)
