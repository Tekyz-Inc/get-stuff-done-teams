# Stack Rule Overrides

This folder is for **project-specific overrides** of GSD-T's global stack rule files.

## How it works

- GSD-T ships 22 best-practice stack files in `templates/stacks/` (installed globally via npm)
- When a stack is detected (e.g., React in `package.json`), the corresponding file is injected into subagent prompts
- If a file with the **same name** exists in this folder, it replaces the global version for this project

## When to use

- Your project has stack-specific conventions that differ from the global defaults
- You want to add rules or remove rules for a particular stack in this project only
- You want to extend a stack file with project-specific patterns

## Example

To override React rules for this project:
1. Copy the global file: `cp $(npm root -g)/@tekyzinc/gsd-t/templates/stacks/react.md .gsd-t/stacks/react.md`
2. Edit `.gsd-t/stacks/react.md` with your project-specific changes
3. The modified version will be used instead of the global one

## Available global stack files

`_security.md`, `react.md`, `react-native.md`, `nextjs.md`, `vue.md`, `typescript.md`, `node-api.md`, `rest-api.md`, `tailwind.md`, `vite.md`, `supabase.md`, `firebase.md`, `graphql.md`, `zustand.md`, `redux.md`, `neo4j.md`, `postgresql.md`, `python.md`, `flutter.md`, `docker.md`, `github-actions.md`, `playwright.md`
