# GSD-T: Backlog List — Filtered View of Backlog Items

You are displaying the project backlog with optional filtering and limiting.

## Step 1: Read Backlog

Read `.gsd-t/backlog.md` and parse all entries.

Each entry follows this format:
```
## {N}. {title}
- **Type:** {type} | **App:** {app} | **Category:** {category}
- **Added:** {YYYY-MM-DD}
- {description}
```

If `.gsd-t/backlog.md` does not exist or contains only the `# Backlog` heading with no entries, display:
"No backlog items. Use `/gsd-t-backlog-add` to capture ideas."
Then STOP.

## Step 2: Apply Filters

Parse `$ARGUMENTS` for optional filters:
- **--type ...** — Show only entries matching this type
- **--app ...** — Show only entries matching this app
- **--category ...** — Show only entries matching this category

If multiple filters are specified, apply AND logic (entry must match ALL specified filters).

If no filters are specified, include all entries.

## Step 3: Apply Limit

If **--top N** is specified, keep only the first N entries from the filtered results (by position order, which represents priority).

## Step 4: Display Results

Show the filtered entries in a formatted view:

```
# Backlog ({count} items{filter description})

| # | Title | Type | App | Category | Added |
|---|-------|------|-----|----------|-------|
| 1 | {title} | {type} | {app} | {category} | {date} |
| 2 | {title} | {type} | {app} | {category} | {date} |
```

Where:
- `{count}` = number of entries shown
- `{filter description}` = if filters applied, append: `, filtered by type={value}` / `app={value}` / `category={value}` as appropriate. If no filters, omit.
- The `#` column shows the original position number from the backlog (not a re-numbered index)

## Step 5: Handle Empty Results

If filters were applied but no entries match, display:
"No backlog items match the filters: {filter summary}. Use `/gsd-t-backlog-list` with no arguments to see all items."

$ARGUMENTS
