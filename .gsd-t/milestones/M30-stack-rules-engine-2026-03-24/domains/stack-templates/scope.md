# Domain: stack-templates

## Responsibility
Create the stack-specific best practice rule files that the detection engine will inject into subagent prompts. Each file is a standalone markdown document containing mandatory coding standards for a specific language/framework.

## Owned Files/Directories
- `templates/stacks/react.md` — React patterns (React Query, hooks, component design, a11y, anti-patterns)
- `templates/stacks/typescript.md` — Strict TypeScript rules (no `any`, interfaces, generics, strict tsconfig)
- `templates/stacks/node-api.md` — Node.js API patterns (Express/Fastify, service layer, error handling, middleware)

## NOT Owned (do not modify)
- `templates/stacks/_security.md` — already created, owned by lead
- `commands/` — all command files (owned by command-integration domain)
- `bin/` — CLI code
- `templates/CLAUDE-global.md`, `templates/CLAUDE-project.md` — existing templates
