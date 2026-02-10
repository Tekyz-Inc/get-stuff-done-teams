# File Format Contract

Defines the exact format of backlog files that all domains must agree on.

## backlog.md Format

Owner: templates domain
Consumers: commands domain, integration domain

```markdown
# Backlog

## 1. {title}
- **Type:** {type} | **App:** {app} | **Category:** {category}
- **Added:** {YYYY-MM-DD}
- {1-2 sentence description}

## 2. {title}
- **Type:** {type} | **App:** {app} | **Category:** {category}
- **Added:** {YYYY-MM-DD}
- {description}
```

### Rules
- Each entry is an H2 heading: `## {position}. {title}`
- Position is the sequential number in the document (1, 2, 3...)
- Metadata line format: `- **Type:** {value} | **App:** {value} | **Category:** {value}`
- Date line format: `- **Added:** {YYYY-MM-DD}`
- Description line: `- {text}` (1-2 sentences)
- Empty line between entries
- No entries = file contains only the `# Backlog` heading

## backlog-settings.md Format

Owner: templates domain
Consumers: commands domain, integration domain

```markdown
# Backlog Settings

## Types
- bug
- feature
- improvement
- ux
- architecture

## Apps
- {app1}
- {app2}

## Categories
- {category1}
- {category2}

## Defaults
- **Default App:** {app}
- **Auto-categorize:** true
```

### Rules
- Each dimension (Types, Apps, Categories) is an H2 section with a markdown list
- Items are simple `- {value}` entries, lowercase
- Defaults section uses bold key format: `- **Key:** value`
- Categories may be empty on first creation (populated during init category derivation)
