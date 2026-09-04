# Command Interface Contract

Defines the command names, purposes, and argument patterns that integration domain needs.

Owner: commands domain
Consumers: integration domain

## Commands

| Command | Slash Name | Purpose | Arguments |
|---------|-----------|---------|-----------|
| Backlog Add | `gsd-t-backlog-add` | Capture item, auto-categorize, append to bottom | `"<title>" [--desc "..."] [--type ...] [--app ...] [--category ...]` |
| Backlog List | `gsd-t-backlog-list` | Filtered, ordered view | `[--type ...] [--app ...] [--category ...] [--top N]` |
| Backlog Move | `gsd-t-backlog-move` | Reorder by position | `<from-position> <to-position>` |
| Backlog Promote | `gsd-t-backlog-promote` | Refine → classify → create GSD-T artifact | `<position>` |
| Backlog Edit | `gsd-t-backlog-edit` | Modify entry fields | `<position> [--title "..."] [--desc "..."] [--type ...] [--app ...] [--category ...]` |
| Backlog Remove | `gsd-t-backlog-remove` | Drop item with optional reason | `<position> [--reason "..."]` |
| Backlog Settings | `gsd-t-backlog-settings` | Manage types, apps, categories, defaults | `<subcommand> [args]` |

## Settings Subcommands

| Subcommand | Purpose | Example |
|-----------|---------|---------|
| `list` | Show all settings | `gsd-t-backlog-settings list` |
| `add-type <name>` | Add a type | `gsd-t-backlog-settings add-type compliance` |
| `remove-type <name>` | Remove a type | `gsd-t-backlog-settings remove-type architecture` |
| `add-app <name>` | Add an app | `gsd-t-backlog-settings add-app api` |
| `remove-app <name>` | Remove an app | `gsd-t-backlog-settings remove-app mobile` |
| `add-category <name>` | Add a category | `gsd-t-backlog-settings add-category notifications` |
| `remove-category <name>` | Remove a category | `gsd-t-backlog-settings remove-category sync` |
| `default-app <name>` | Change default app | `gsd-t-backlog-settings default-app admin` |

## Promote Flow Classification

The promote command classifies items into one of:
- **Milestone** — Multi-file, multi-phase, needs partitioning
- **Quick** — Small scope, obvious implementation
- **Debug** — Diagnosis + fix for specific broken behavior
- **Feature analysis** — Triggers gsd-t-feature for impact assessment first
