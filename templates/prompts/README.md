# GSD-T Subagent Prompt Templates

This directory holds long-form prompts that used to be inlined into command markdown files. Inlining them caused massive context burn — each Task subagent spawn re-materialized ~3000 tokens of prompt boilerplate, dozens of times per milestone.

Now command files reference these by path. The orchestrator passes the file path to the subagent, the subagent reads it itself. The orchestrator never holds the full prompt in its own context.

## Files

| File | Purpose | Run frequency |
|------|---------|---------------|
| `qa-subagent.md` | Test generation, execution, gap reporting | Per task |
| `red-team-subagent.md` | Adversarial bug hunting | Per domain (NOT per task) |
| `design-verify-subagent.md` | Visual element-by-element design audit | Per domain (NOT per task) |

## Why per-domain instead of per-task

Red Team and Design Verification were originally per-domain. They were promoted to per-task by commits `da6d3ae` and `b68353e`, on the assumption that the orchestrator's environment-variable-based context self-check would catch context drain before it got bad. That env-var path was never populated by Claude Code — the self-check was vaporware. With it inert, per-task spawning of ~10k-token Red Team subagents drained sessions in 5-10 tasks. Reverting them to per-domain raises the safe task count from ~5 to ~15+. v2.0.0 (M34) replaced the broken check with real `count_tokens` measurements via the Context Meter PostToolUse hook.

QA stays per-task because (a) it's much smaller, (b) it grounds against contracts which can drift task by task.

## Adding a new prompt

Write the prompt as a self-contained markdown file in this directory. Reference it from the command file with:

```
Spawn Task subagent (general-purpose, model: <model>):
"Read `templates/prompts/<your-prompt>.md` and follow it. Context for this run: <one-line context>."
```

Keep the inline context to one line. The prompt body must live in the file, not the command.
