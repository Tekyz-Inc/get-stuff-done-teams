# GSD-T: Design Build — Deterministic Design-to-Code Pipeline

This command delegates to the **JavaScript orchestrator** for ironclad flow control. Do NOT attempt to run the build pipeline inline — the orchestrator handles Claude spawning, measurement, review gates, and feedback processing deterministically.

## Step 1: Launch the Orchestrator

```bash
gsd-t design-build $ARGUMENTS
```

That's it. The orchestrator handles everything:

1. Reads contracts from `.gsd-t/contracts/design/`
2. Starts dev server + review server
3. For each tier (elements → widgets → pages):
   - Spawns Claude to build components from contracts
   - Measures with Playwright
   - Queues for human review
   - **Blocks in a JS polling loop** until the human submits (ironclad gate)
   - Processes feedback, applies fixes if needed
   - Proceeds to next tier only after approval

## Options

Pass any of these as `$ARGUMENTS`:

| Flag | Purpose |
|------|---------|
| `--resume`          | Resume from last saved state after interruption |
| `--tier <name>`     | Start from a specific tier (`elements`, `widgets`, `pages`) |
| `--project <dir>`   | Target project directory (default: current directory) |
| `--dev-port <N>`    | Dev server port (default: 5173) |
| `--review-port <N>` | Review server port (default: 3456) |
| `--timeout <sec>`   | Claude timeout per tier in seconds (default: 600) |
| `--skip-measure`    | Skip Playwright measurement (human-review only) |
| `--clean`           | Clear all stale artifacts + delete build output before each phase |
| `--parallel <N>`    | Run N items concurrently (default: all items in parallel) |
| `--verbose`, `-v`   | Show Claude's tool calls and prompts in terminal |

## Prerequisites

- Design contracts must exist in `.gsd-t/contracts/design/` with an `INDEX.md`
- If no contracts exist, run `/gsd-t-design-decompose` first

## Why a JS Orchestrator?

Claude Code agents optimize for task completion and will skip any prompt instruction that asks them to pause indefinitely — including bash polling loops, `BLOCKING` headers, and `STOP` directives. Three separate attempts to enforce review gates via prompt instructions all failed. The JS orchestrator moves flow control out of prompts entirely into deterministic JavaScript.
