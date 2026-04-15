# GSD-T: Backlog List — Filtered View of Backlog Items

You are displaying the project backlog with optional filtering and limiting.

## Step 0: Parse --file flag

If `$ARGUMENTS` contains `--file {path}`, read from `.gsd-t/{path}` instead of the default `.gsd-t/backlog.md`. This enables listing alternate backlog files such as `.gsd-t/optimization-backlog.md` (produced by the token optimizer at complete-milestone):

```
/user:gsd-t-backlog-list --file optimization-backlog.md
/user:gsd-t-backlog-list --file optimization-backlog.md --status pending
```

Also support `--status {pending|promoted|rejected}` when listing the optimization backlog — filters by the `**Status**:` field inside each H2 block.

If `--file optimization-backlog.md` is supplied, use `bin/token-optimizer.cjs` parseBacklog() to parse entries, then render a simplified table with columns: ID, Type, Status, Evidence (truncated to 80 chars). Example:

```bash
node -e "
const opt = require('./bin/token-optimizer.cjs');
const entries = opt.parseBacklog(opt.readBacklog('.'));
const statusFilter = process.argv[1] || '';
const filtered = statusFilter
  ? entries.filter(e => e.status === statusFilter)
  : entries;
if (filtered.length === 0) {
  console.log('No recommendations' + (statusFilter ? ' with status=' + statusFilter : '') + '.');
  process.exit(0);
}
console.log('# Optimization Backlog (' + filtered.length + ' entries' + (statusFilter ? ', status=' + statusFilter : '') + ')');
console.log('');
console.log('| ID | Type | Status | Evidence |');
console.log('|---|---|---|---|');
for (const e of filtered) {
  const ev = (e.evidence || '').slice(0, 80);
  console.log('| ' + e.id + ' | ' + (e.type || '') + ' | ' + (e.status || '') + ' | ' + ev + ' |');
}
" "$STATUS_FILTER"
```

Exit after rendering when `--file` is present — skip the default steps below.

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

## Auto-Clear

All work is committed to project files. Execute `/clear` to free the context window for the next command.
