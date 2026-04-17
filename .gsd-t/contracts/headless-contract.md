# Contract: Headless Mode Interface

## Version: 1.0
## Milestone: M23
## Status: Active

---

## CLI Interface

### headless exec

```
gsd-t headless <command> [args...] [flags]
```

**Arguments:**
- `command` — GSD-T command name (without `gsd-t-` prefix), e.g., `verify`, `status`, `execute`
- `args` — Additional arguments passed to the command
- `--json` — Output structured JSON envelope instead of raw text
- `--timeout=N` — Kill after N seconds (default: 300)
- `--log` — Write output to .gsd-t/headless-{timestamp}.log

**Invocation:**
```
claude -p "/gsd-t-{command} {args}"
```

### headless query

```
gsd-t headless query <type>
```

**Query types:**
- `status` — Version, active milestone, phase, completion counts
- `domains` — Domain list with status
- `contracts` — Contract file list with metadata
- `debt` — Tech debt items
- `context` — Token log summary
- `backlog` — Backlog items
- `graph` — Graph index metadata

---

## Exit Codes

| Code | Meaning | Trigger |
|------|---------|---------|
| 0    | success | Command completed successfully |
| 1    | verify-fail | Output contains verification failure markers |
| 2    | context-budget-exceeded | Output contains budget/context exceeded markers |
| 3    | error | Process error, non-zero claude exit, parse failure |
| 4    | blocked-needs-human | Output contains "blocked" or "needs human" markers |

---

## JSON Envelope (--json flag)

```json
{
  "success": true,
  "exitCode": 0,
  "gsdtExitCode": 0,
  "command": "verify",
  "args": [],
  "output": "...",
  "timestamp": "2026-03-22T10:00:00.000Z",
  "duration": 42150,
  "logFile": ".gsd-t/headless-1742641200000.log"
}
```

---

## Query Response Shape

```json
{
  "type": "status",
  "timestamp": "2026-03-22T10:00:00.000Z",
  "data": { ... }
}
```

### status data shape
```json
{
  "version": "2.41.10",
  "project": "GSD-T Framework",
  "status": "IN PROGRESS",
  "activeMilestone": "M23",
  "phase": "EXECUTE"
}
```

### domains data shape
```json
{
  "domains": [
    { "name": "headless-exec", "hasScope": true, "hasTasks": true, "hasConstraints": false }
  ]
}
```

### contracts data shape
```json
{
  "contracts": ["headless-contract.md", "api-contract.md"]
}
```

### debt data shape
```json
{
  "items": [
    { "id": "D001", "severity": "HIGH", "description": "..." }
  ],
  "count": 1
}
```

### context data shape
```json
{
  "entries": [...],
  "totalTokens": 12500,
  "entryCount": 8
}
```

### backlog data shape
```json
{
  "items": [...],
  "count": 5
}
```

### graph data shape
```json
{
  "available": true,
  "provider": "native",
  "entityCount": 264,
  "relationshipCount": 725,
  "lastIndexed": "2026-03-20T12:00:00.000Z"
}
```
