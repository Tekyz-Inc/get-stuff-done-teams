# Contract: Backlog File Formats

## Owner
GSD-T framework (backlog system commands)

## Consumers
gsd-t-backlog-add, gsd-t-backlog-list, gsd-t-backlog-move, gsd-t-backlog-edit, gsd-t-backlog-remove, gsd-t-backlog-promote, gsd-t-backlog-settings, gsd-t-status

---

## backlog.md

### File Location
`.gsd-t/backlog.md`

### Format
```markdown
# Backlog

## {N}. {title}
- **Type:** {type} | **App:** {app} | **Category:** {category}
- **Added:** {YYYY-MM-DD}
- {description}

## {N}. {title}
- **Type:** {type} | **App:** {app} | **Category:** {category}
- **Added:** {YYYY-MM-DD}
- {description}
```

### Entry Fields
| Field | Required | Source | Format |
|-------|----------|--------|--------|
| Position (N) | YES | Sequential integer | `## {N}. ` prefix on heading |
| Title | YES | User input | Free text |
| Type | YES | Explicit or auto-categorized | Must be in backlog-settings.md Types list |
| App | YES | Explicit or default from settings | Must be in backlog-settings.md Apps list |
| Category | YES | Explicit or auto-categorized | Must be in backlog-settings.md Categories list, or `general` |
| Added | YES | Auto-generated | `YYYY-MM-DD` |
| Description | YES | `--desc` arg or derived from title | Free text |

### Position Numbering
- Positions are sequential integers starting at 1
- `gsd-t-backlog-move` renumbers all entries when items are reordered
- `gsd-t-backlog-remove` renumbers remaining entries to close gaps
- Position determines priority (1 = highest)

### Entry Detection
Entries are identified by counting `## {N}.` heading patterns.

### Initialization
Created by `gsd-t-init` from `templates/backlog.md`. Contains only `# Backlog` heading (no entries).

---

## backlog-settings.md

### File Location
`.gsd-t/backlog-settings.md`

### Format
```markdown
# Backlog Settings

## Types
- bug
- feature
- improvement
- ux
- architecture

## Apps
- {app-name}

## Categories
- {category-name}

## Defaults
- **Default App:** {app-name}
- **Auto-categorize:** true | false
```

### Sections

#### Types
Bulleted list of allowed type values. Each entry is a `- {value}` line. Used for validation by `gsd-t-backlog-add` and `gsd-t-backlog-edit`.

Standard types:
| Type | Trigger Words (for auto-categorize) |
|------|--------------------------------------|
| bug | bug, fix, broken, error, crash |
| feature | add, new, create, implement |
| improvement | improve, optimize, refactor, clean |
| ux | ui, ux, design, layout, style |
| architecture | architecture, structure, pattern, system |

#### Apps
Bulleted list of allowed app identifiers. Projects with multiple apps/services list each one.

#### Categories
Bulleted list of allowed category values. Project-specific groupings (e.g., `cli`, `commands`, `templates`, `docs`).

#### Defaults
- **Default App**: Used when `--app` is not provided to `gsd-t-backlog-add`
- **Auto-categorize**: When `true`, `gsd-t-backlog-add` infers missing type and category from title/description keywords

### Initialization
Created by `gsd-t-init` from `templates/backlog-settings.md`. Types are pre-populated with the 5 standard types. Apps, Categories, and Defaults are populated based on the project's CLAUDE.md or set to sensible defaults.

---

## Validation Rules

1. **Type must be in settings**: `gsd-t-backlog-add` and `gsd-t-backlog-edit` reject unknown types with a suggestion for closest match
2. **App must be in settings**: Same validation as type
3. **Category must be in settings**: Same validation, or defaults to `general` if no categories defined
4. **Position must be valid**: `gsd-t-backlog-move` validates target position is within range
5. **Settings file required**: All backlog commands except `gsd-t-init` require `backlog-settings.md` to exist
