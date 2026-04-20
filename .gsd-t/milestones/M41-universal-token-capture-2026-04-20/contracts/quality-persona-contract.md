# Contract: Quality Persona (Quality North Star)

## Owner
Domain: quality-persona

## Consumers
- All subagent-spawning commands (via project CLAUDE.md injection at runtime)
- Any command that reads project CLAUDE.md for configuration

## Storage Format

Quality persona is stored in project `CLAUDE.md` under a dedicated section:

```markdown
## Quality North Star

{persona text — 1-3 sentences describing the quality identity of this project}
```

Example (library/package preset):
```markdown
## Quality North Star

This is a published npm library. Every public API must be intuitive, well-documented, and backward-compatible. Type safety and zero-dependency design are non-negotiable.
```

Example (web application preset):
```markdown
## Quality North Star

This is a user-facing web application. Every feature must be accessible, performant, and visually consistent. The user experience is the product.
```

Example (CLI tool preset):
```markdown
## Quality North Star

This is a developer CLI tool. Every command must be fast, predictable, and produce clear output. Error messages must explain what went wrong and how to fix it.
```

## Injection Protocol

- **Where**: Prepended before procedural checks in subagent prompts
- **When**: At subagent spawn time (execute, quick, integrate, wave, debug)
- **How**: Read `## Quality North Star` from project CLAUDE.md; if section missing → skip silently
- **Scope**: Project-level only — never injected from global ~/.claude/CLAUDE.md

## Backward Compatibility

- Projects initialized before M32 have no `## Quality North Star` section → injection skips silently
- No migration required — persona is opt-in via init/setup

## Preset Options

| Preset ID       | Use When                                    |
|-----------------|---------------------------------------------|
| `library`       | npm package, SDK, shared utility            |
| `web-app`       | User-facing web application                 |
| `cli`           | Developer CLI or command-line utility       |
| `custom`        | User writes their own 1-3 sentence persona  |

## Auto-Detection Hints (for init)

| Signal                              | Suggested Preset |
|-------------------------------------|------------------|
| `package.json` has `"main"` + no `"scripts.dev"` | `library` |
| `package.json` has React/Vue/Next.js | `web-app`   |
| `package.json` has `"bin"` field    | `cli`            |
| No strong signal                    | Prompt user to choose |
