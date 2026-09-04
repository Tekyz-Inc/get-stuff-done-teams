# Stack Rules Contract

## Status: ACTIVE

## Overview
Defines how stack detection, template matching, and prompt injection work across all subagent-spawning commands.

## Stack Detection Protocol

### Detection Sources
| Project File | Detected Stack | Template Match |
|---|---|---|
| `package.json` with `"react"` in dependencies/devDependencies | React | `react.md` |
| `package.json` with `"typescript"` or `tsconfig.json` exists | TypeScript | `typescript.md` |
| `package.json` with `"express"` or `"fastify"` or `"hono"` or `"koa"` | Node API | `node-api.md` |
| `package.json` with `"tailwindcss"` | Tailwind | `tailwind.md` (when available) |
| `requirements.txt` or `pyproject.toml` exists | Python | `python.md` (when available) |
| `go.mod` exists | Go | `go.md` (when available) |
| `Cargo.toml` exists | Rust | `rust.md` (when available) |

### Detection Logic (Bash)
```bash
# Run at subagent spawn time in the PROJECT directory (not GSD-T package dir)
# Detect stack from project files, find matching templates in GSD-T package

GSD_T_DIR=$(npm root -g 2>/dev/null)/@tekyzinc/gsd-t
STACKS_DIR="$GSD_T_DIR/templates/stacks"
STACK_RULES=""

# Universal rules (always inject)
for f in "$STACKS_DIR"/_*.md; do
  [ -f "$f" ] && STACK_RULES="$STACK_RULES$(cat "$f")\n\n"
done

# Stack-specific detection
if [ -f "package.json" ]; then
  if grep -q '"react"' package.json 2>/dev/null && [ -f "$STACKS_DIR/react.md" ]; then
    STACK_RULES="$STACK_RULES$(cat "$STACKS_DIR/react.md")\n\n"
  fi
  if (grep -q '"typescript"' package.json 2>/dev/null || [ -f "tsconfig.json" ]) && [ -f "$STACKS_DIR/typescript.md" ]; then
    STACK_RULES="$STACK_RULES$(cat "$STACKS_DIR/typescript.md")\n\n"
  fi
  if grep -qE '"(express|fastify|hono|koa)"' package.json 2>/dev/null && [ -f "$STACKS_DIR/node-api.md" ]; then
    STACK_RULES="$STACK_RULES$(cat "$STACKS_DIR/node-api.md")\n\n"
  fi
fi
[ -f "requirements.txt" ] || [ -f "pyproject.toml" ] && [ -f "$STACKS_DIR/python.md" ] && STACK_RULES="$STACK_RULES$(cat "$STACKS_DIR/python.md")\n\n"
[ -f "go.mod" ] && [ -f "$STACKS_DIR/go.md" ] && STACK_RULES="$STACK_RULES$(cat "$STACKS_DIR/go.md")\n\n"
[ -f "Cargo.toml" ] && [ -f "$STACKS_DIR/rust.md" ] && STACK_RULES="$STACK_RULES$(cat "$STACKS_DIR/rust.md")\n\n"
```

## Template File Convention

| Prefix | Behavior | Example |
|---|---|---|
| `_` (underscore) | Universal — always injected | `_security.md` |
| No prefix | Stack-specific — injected when detected | `react.md`, `python.md` |

### Template Structure
Each template file MUST:
1. Start with `# {Name} Standards`
2. Include "These rules are MANDATORY. Violations fail the task."
3. Use numbered sections with GOOD/BAD code examples
4. End with a verification checklist
5. Stay under 200 lines

## Prompt Injection Format

### Work Subagent Injection
Append after the existing "Instructions" section in the subagent prompt:
```
## Stack Rules (MANDATORY — violations fail this task)

{contents of matched template files}

These standards have the same enforcement weight as contract compliance.
Violations are task failures, not warnings.
```

### QA Subagent Injection
Add to existing QA prompt:
```
f. Validate compliance with Stack Rules (injected in the work subagent's prompt).
   Stack rule violations have the same severity as contract violations — report as failures, not warnings.
   Report format addition: "Stack rules: compliant/N violations"
```

## Commands That Must Implement Detection
| Command | Injection Point |
|---|---|
| `gsd-t-execute` | Step 3 — task subagent prompt + Step 2 QA prompt |
| `gsd-t-quick` | Step 0 — subagent spawn prompt |
| `gsd-t-integrate` | Integration subagent prompt |
| `gsd-t-wave` | Phase agent spawn prompt |
| `gsd-t-debug` | Step 0 — debug subagent prompt |

## Resilience Rules
- If `templates/stacks/` doesn't exist → skip silently (no error, no warning)
- If no templates match → skip silently (security.md will still inject as universal)
- If `package.json` is malformed → skip detection for that file, continue with others
- Detection must never block execution — it's additive only
